// Render passes for reference-image export.
//
// Each pass re-renders the posed scene with an override material, so all five
// exports share one camera and one pose and are guaranteed to line up with
// each other and with the Regular pass.

import * as THREE from "three";

export type RenderPass =
  | "regular"
  | "openpose"
  | "openpose-hands"
  | "depth"
  | "canny"
  | "normals";

export const RENDER_PASSES: readonly RenderPass[] = [
  "regular",
  "openpose",
  "openpose-hands",
  "depth",
  "canny",
  "normals",
];

export const PASS_LABELS: Readonly<Record<RenderPass, string>> = {
  regular: "Regular",
  openpose: "OpenPose",
  "openpose-hands": "OpenPose (hands)",
  depth: "Depth",
  canny: "Canny",
  normals: "Normals",
};

export interface ExportOptions {
  width: number;
  height: number;
  transparent: boolean;
  hideHelpers: boolean;
  /**
   * Draw the 32 finger keypoints on the OpenPose pass.
   *
   * Optional and defaulting off so every existing caller keeps the body-only
   * output that ControlNet conditioning expects. The pass name carries the
   * distinction instead ("openpose" vs "openpose-hands") because the two
   * differ in payload and in pixels, and a filename should say which.
   */
  includeHands?: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  width: 2048,
  height: 2048,
  transparent: false,
  hideHelpers: true,
};

export interface PassContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/** Hide the given objects, returning a function that restores them. */
export function hideAll(
  objects: THREE.Object3D[],
  hidden: boolean,
): () => void {
  const previous = objects.map((o) => o.visible);
  for (const o of objects) o.visible = !hidden;
  return () => {
    objects.forEach((o, i) => {
      o.visible = previous[i];
    });
  };
}

/**
 * View-space normals packed into RGB.
 *
 * The normal is transformed into view space and mapped from [-1,1] to [0,1],
 * which is what image-space conditioning models expect.
 */
export function createNormalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: [
      "varying vec3 vViewNormal;",
      "void main() {",
      "  vViewNormal = normalize( normalMatrix * normal );",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying vec3 vViewNormal;",
      "void main() {",
      "  gl_FragColor = vec4( vViewNormal * 0.5 + 0.5, 1.0 );",
      "}",
    ].join("\n"),
    side: THREE.DoubleSide,
  });
}

/**
 * Normalised depth: near geometry black, far geometry white.
 *
 * Normalising by camera far keeps the gradient readable across the whole
 * scene instead of crushing everything into the near plane.
 */
export function createDepthMaterial(camera: THREE.Camera): THREE.ShaderMaterial {
  const cam = camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
  const far = cam.far ?? 100;
  return new THREE.ShaderMaterial({
    uniforms: { uFar: { value: far } },
    vertexShader: [
      "varying float vDepth;",
      "void main() {",
      "  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
      "  vDepth = -mvPosition.z;",
      "  gl_Position = projectionMatrix * mvPosition;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float uFar;",
      "varying float vDepth;",
      "void main() {",
      "  float d = clamp( vDepth / uFar, 0.0, 1.0 );",
      "  gl_FragColor = vec4( vec3( d ), 1.0 );",
      "}",
    ].join("\n"),
    side: THREE.DoubleSide,
  });
}

const SOBEL_FRAGMENT = [
  "uniform sampler2D tDiffuse;",
  "uniform vec2 uTexel;",
  "uniform float uThreshold;",
  "varying vec2 vUv;",
  "float luma( vec2 uv ) {",
  "  vec3 c = texture2D( tDiffuse, uv ).rgb;",
  "  return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );",
  "}",
  "void main() {",
  "  float tl = luma( vUv + uTexel * vec2( -1.0,  1.0 ) );",
  "  float t  = luma( vUv + uTexel * vec2(  0.0,  1.0 ) );",
  "  float tr = luma( vUv + uTexel * vec2(  1.0,  1.0 ) );",
  "  float l  = luma( vUv + uTexel * vec2( -1.0,  0.0 ) );",
  "  float r  = luma( vUv + uTexel * vec2(  1.0,  0.0 ) );",
  "  float bl = luma( vUv + uTexel * vec2( -1.0, -1.0 ) );",
  "  float b  = luma( vUv + uTexel * vec2(  0.0, -1.0 ) );",
  "  float br = luma( vUv + uTexel * vec2(  1.0, -1.0 ) );",
  "  float gx = -tl + tr - 2.0 * l + 2.0 * r - bl + br;",
  "  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;",
  "  float mag = length( vec2( gx, gy ) );",
  "  gl_FragColor = vec4( vec3( step( uThreshold, mag ) ), 1.0 );",
  "}",
].join("\n");

const QUAD_VERTEX = [
  "varying vec2 vUv;",
  "void main() {",
  "  vUv = uv;",
  "  gl_Position = vec4( position.xy, 0.0, 1.0 );",
  "}",
].join("\n");

/**
 * Sobel edge detection over a luminance render of the scene.
 *
 * three has no built-in sobel pass, so the scene is rendered with a flat
 * material into a render target and then convolved with a 3x3 kernel.
 */
export class CannyPass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1,
  );
  private readonly quadGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly material: THREE.ShaderMaterial;
  private readonly flatMaterial: THREE.MeshBasicMaterial;

  constructor(width: number, height: number) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        uThreshold: { value: 0.08 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: SOBEL_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.flatMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.quadScene.add(new THREE.Mesh(this.quadGeometry, this.material));
  }

  /** Render `scene` through a luminance pass, then convolve it into edges. */
  render(ctx: PassContext, helpers: THREE.Object3D[]): void {
    const restore = hideAll(helpers, true);
    const previousBackground = ctx.scene.background;
    ctx.scene.background = new THREE.Color(0x000000);
    ctx.scene.overrideMaterial = this.flatMaterial;
    ctx.renderer.setRenderTarget(this.target);
    ctx.renderer.clear();
    ctx.renderer.render(ctx.scene, ctx.camera);
    ctx.scene.overrideMaterial = null;
    ctx.scene.background = previousBackground;
    restore();
    ctx.renderer.setRenderTarget(null);
    ctx.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.flatMaterial.dispose();
    this.quadGeometry.dispose();
  }
}
