import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SceneEnvironment } from "../scene/SceneEnvironment";
import { DepthPreview } from "./DepthPreview";
import { CameraRig, DEFAULT_CAMERA_POSE, type CameraPose } from "./CameraRig";

// Owns the WebGL renderer, scene, camera and orbit controls.
// Kept framework-free so later milestone systems attach without a Vue dependency.
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly environment: SceneEnvironment;

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private frameHandle = 0;
  private readonly depthPreview: DepthPreview;
  readonly cameraRig: CameraRig;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14161a);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_POSE.fov,
      this.aspect(),
      0.05,
      500,
    );
    // Set through CameraRig's shared default so Reset cannot drift from the
    // opening view.
    this.camera.position.fromArray(DEFAULT_CAMERA_POSE.position);


    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.fromArray(DEFAULT_CAMERA_POSE.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this.environment = new SceneEnvironment(this.camera);
    this.environment.attach(this.scene);
    this.depthPreview = new DepthPreview(this.scene, this.camera);
    this.cameraRig = new CameraRig(
      this.camera,
      this.controls,
      this.renderer.domElement,
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private aspect(): number {
    const { clientWidth, clientHeight } = this.container;
    return clientHeight === 0 ? 1 : clientWidth / clientHeight;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  start(): void {
    let previous = performance.now();
    const loop = (): void => {
      this.frameHandle = requestAnimationFrame(loop);
      const now = performance.now();
      // Clamped so a backgrounded tab does not jump the animation forward by
      // however long it was hidden.
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      this.onFrame?.(delta);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Called every rendered frame with the elapsed seconds. */
  onFrame: ((deltaSeconds: number) => void) | null = null;

  /** True while the viewport is showing the depth override. */
  get previewingDepth(): boolean {
    return this.depthPreview.active;
  }

  /**
   * Turn the live depth preview on or off.
   *
   * Uses the same shader the depth export pass uses, so what the artist
   * previews is exactly what gets exported. Returns the new state.
   */
  setDepthPreview(on: boolean): boolean {
    return this.depthPreview.set(on);
  }

  stop(): void {
    cancelAnimationFrame(this.frameHandle);
  }

  dispose(): void {
    this.stop();
    // A preview left on at teardown would leak its material.
    this.depthPreview.dispose();
    this.resizeObserver.disconnect();
    this.environment.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

