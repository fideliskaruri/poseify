// Camera, lighting and ground environment.
//
// Owns the three things an artist adjusts constantly while posing: field of
// view (for dramatic perspective), light direction (to read form), and the
// ground grid (to judge footing and scale).

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface LightState {
  // Horizontal angle in degrees. 0 = light from +Z, increasing clockwise.
  azimuth: number;
  // Vertical angle in degrees. 90 = directly overhead, 0 = at the horizon.
  elevation: number;
  intensity: number;
  distance: number;
  castShadows: boolean;
}

export interface GridState {
  visible: boolean;
  // Metres between major lines.
  cellSize: number;
  // Major lines per axis.
  divisions: number;
  opacity: number;
}

const DEG2RAD = Math.PI / 180;

export class SceneEnvironment {
  readonly light: THREE.DirectionalLight;
  readonly fill: THREE.HemisphereLight;

  // Recomputed whenever models are added so shadows and framing stay in range.
  boundsRadius = 4;

  private readonly gridGroup = new THREE.Group();
  private readonly lightGizmo: THREE.Group;
  private readonly shadowPlane: THREE.Mesh;
  private readonly camera: THREE.PerspectiveCamera;

  private lightState: LightState = {
    azimuth: 40,
    elevation: 55,
    intensity: 2.4,
    distance: 9,
    castShadows: true,
  };

  private gridState: GridState = {
    visible: true,
    cellSize: 1,
    divisions: 40,
    opacity: 0.55,
  };

  private showLightGizmo = true;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    this.light = new THREE.DirectionalLight(0xffffff, this.lightState.intensity);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = 60;
    this.light.shadow.bias = -0.0008;

    this.fill = new THREE.HemisphereLight(0xbcd2ff, 0x2a2118, 0.55);

    this.lightGizmo = this.buildLightGizmo();

    // A shadow-only receiver so the figure casts onto the ground without grid
    // lines fighting the shadow.
    this.shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.name = "ShadowPlane";

    this.gridGroup.name = "Ground";
    this.gridGroup.add(this.shadowPlane);

    this.rebuildGrid();
    this.applyLight();
  }

  /** Everything this system owns, for adding to a scene in one call. */
  get objects(): THREE.Object3D[] {
    return [this.gridGroup, this.light, this.lightGizmo, this.fill];
  }

  attach(scene: THREE.Scene): void {
    for (const o of this.objects) scene.add(o);
  }

  // ---------------------------------------------------------------- camera

  /**
   * Field of view in degrees. This is the "dramatic perspective" control: a
   * narrow FOV compresses depth and flattens the figure, a wide one exaggerates
   * it and pushes near geometry toward the camera.
   */
  setFov(degrees: number): void {
    this.camera.fov = THREE.MathUtils.clamp(degrees, 5, 120);
    this.camera.updateProjectionMatrix();
  }

  getFov(): number {
    return this.camera.fov;
  }

  /** Frame a bounding box, honouring the current FOV and aspect ratio. */
  frame(box: THREE.Box3, controls: OrbitControls, fillRatio = 0.85): void {
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;

    const vFov = this.camera.fov * DEG2RAD;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist =
      Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) /
      fillRatio;

    const dir = new THREE.Vector3(0.55, 0.32, 1).normalize();
    controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.updateProjectionMatrix();
    controls.update();
    this.boundsRadius = radius;
    this.applyLight();
  }

  // ---------------------------------------------------------------- light

  setLight(partial: Partial<LightState>): void {
    this.lightState = { ...this.lightState, ...partial };
    this.applyLight();
  }

  getLight(): LightState {
    return { ...this.lightState };
  }

  setLightGizmoVisible(visible: boolean): void {
    this.showLightGizmo = visible;
    this.lightGizmo.visible = visible;
  }

  get lightGizmoVisible(): boolean {
    return this.showLightGizmo;
  }

  /**
   * Place the light from spherical angles.
   *
   * Azimuth 0 puts the light on +Z (behind the default camera), rising
   * clockwise seen from above. Elevation is clamped just short of the poles so
   * the direction vector stays well defined.
   */
  private applyLight(): void {
    const az = this.lightState.azimuth * DEG2RAD;
    const el = THREE.MathUtils.clamp(this.lightState.elevation, 1, 179) * DEG2RAD;
    const d = this.lightState.distance;

    // Standard spherical convention: elevation is measured up from the
    // horizon, so Y uses sin and the horizontal components use cos. Using
    // cos for Y would put "90 degrees" (straight down) on the horizon.
    this.light.position.set(
      d * Math.cos(el) * Math.sin(az),
      d * Math.sin(el),
      d * Math.cos(el) * Math.cos(az),
    );
    this.light.intensity = this.lightState.intensity;
    this.light.castShadow = this.lightState.castShadows;
    this.light.target.position.set(0, 0, 0);
    this.light.target.updateMatrixWorld();

    // The gizmo sits at the light's own position and looks at the origin, so
    // the arrow the artist sees is exactly where the light is. That is the
    // whole point of the control. Object3D.lookAt aims +Z at the target, so the
    // arrow geometry is built along -Z to match that forward direction.
    this.lightGizmo.position.copy(this.light.position);
    this.lightGizmo.lookAt(0, 0, 0);

    const extent = Math.max(6, this.boundsRadius * 2.4);
    const cam = this.light.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.updateProjectionMatrix();

    this.shadowPlane.visible = this.lightState.castShadows;
  }

  private buildLightGizmo(): THREE.Group {
    const gizmo = new THREE.Group();
    gizmo.name = "LightGizmo";

    // Object3D.lookAt aims the object's +Z axis at the target, and the target
    // here is the origin. So the arrow is modelled along -Z: the cone tip sits
    // furthest along -Z and points at the subject, exactly where the light
    // travels. A cylinder's axis is +Y and a cone's tip is +Y, so both are
    // rotated a quarter turn about X to lie along Z, then flipped so the cone
    // tip leads.
    const material = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8),
      material,
    );
    shaft.position.z = -0.21;
    shaft.rotation.x = Math.PI / 2;
    gizmo.add(shaft);

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.16, 12),
      material,
    );
    head.position.z = -0.5;
    head.rotation.x = -Math.PI / 2;
    gizmo.add(head);

    // Drawn through geometry so the direction is never ambiguous.
    gizmo.traverse((o) => {
      o.renderOrder = 999;
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!mat) return;
      mat.depthTest = false;
      mat.transparent = true;
      mat.opacity = 0.95;
    });

    gizmo.visible = this.showLightGizmo;
    return gizmo;
  }

  // ----------------------------------------------------------------- grid

  setGrid(partial: Partial<GridState>): void {
    const needsRebuild =
      (partial.cellSize !== undefined &&
        partial.cellSize !== this.gridState.cellSize) ||
      (partial.divisions !== undefined &&
        partial.divisions !== this.gridState.divisions);

    this.gridState = { ...this.gridState, ...partial };
    this.gridState.cellSize = Math.max(this.gridState.cellSize, 0.05);
    this.gridState.divisions = Math.max(2, Math.round(this.gridState.divisions));
    this.gridState.opacity = THREE.MathUtils.clamp(this.gridState.opacity, 0, 1);

    if (needsRebuild) this.rebuildGrid();
    this.applyGridVisibility();
  }

  getGrid(): GridState {
    return { ...this.gridState };
  }

  /**
   * Rebuild the ground grid.
   *
   * A single GridHelper cannot show a readable minor/major hierarchy, so two
   * are layered: a fine grid at `cellSize` and a coarse one every 10 cells.
   * That gives distance cues without needing a texture.
   */
  private rebuildGrid(): void {
    for (const child of [...this.gridGroup.children]) {
      if (child === this.shadowPlane) continue;
      this.gridGroup.remove(child);
      const line = child as THREE.LineSegments;
      line.geometry?.dispose();
      (line.material as THREE.Material | undefined)?.dispose();
    }

    const { cellSize, divisions } = this.gridState;
    const extent = cellSize * divisions;

    const minor = new THREE.GridHelper(extent, divisions, 0x39414f, 0x272d37);
    minor.position.y = 0;
    const minorMat = minor.material as THREE.Material;
    minorMat.transparent = true;
    minorMat.opacity = this.gridState.opacity;
    minor.name = "GridMinor";
    this.gridGroup.add(minor);

    const majorDivisions = Math.max(2, Math.round(divisions / 10));
    const major = new THREE.GridHelper(
      extent,
      majorDivisions,
      0x5b6878,
      0x454f5d,
    );
    major.position.y = 0.0015;
    const majorMat = major.material as THREE.Material;
    majorMat.transparent = true;
    majorMat.opacity = Math.min(1, this.gridState.opacity * 1.4);
    major.name = "GridMajor";
    this.gridGroup.add(major);
  }

  private applyGridVisibility(): void {
    for (const child of this.gridGroup.children) {
      if (child !== this.shadowPlane) child.visible = this.gridState.visible;
    }
  }

  dispose(): void {
    this.gridGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.light.dispose();
    this.fill.dispose();
  }
}
