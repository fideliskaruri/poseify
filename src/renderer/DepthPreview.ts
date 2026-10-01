// Live depth preview: swap the scene's override material for the export depth
// shader and back again.
//
// Split out of Viewport so the state discipline can be tested without a GL
// context. The invariant that matters: whatever override material was
// installed before the preview goes on must be exactly what is installed after
// it comes off. An export running alongside a preview installs its own
// override, so assuming "restore to null" would clobber it.

import * as THREE from "three";
import { createDepthMaterial } from "../export/RenderPasses";

export class DepthPreview {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private material: THREE.Material | null = null;
  private previous: THREE.Material | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  get active(): boolean {
    return this.material !== null;
  }

  /**
   * Turn the preview on or off and return the resulting state.
   *
   * Idempotent: asking for the state it is already in changes nothing and, in
   * particular, does not capture the preview's own material as the "previous"
 * override, which would make a later restore self-referential.
   */
  set(on: boolean): boolean {
    if (on === this.active) return on;
    if (on) {
      this.previous = this.scene.overrideMaterial;
      this.material = createDepthMaterial(this.camera);
      this.scene.overrideMaterial = this.material;
    } else {
      this.scene.overrideMaterial = this.previous;
      this.material?.dispose();
      this.material = null;
      this.previous = null;
    }
    return on;
  }

  toggle(): boolean {
    return this.set(!this.active);
  }

  dispose(): void {
    if (this.active) this.set(false);
  }
}
