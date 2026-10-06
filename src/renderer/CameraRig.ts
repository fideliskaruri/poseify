// Camera control: lock, reset, named presets and viewport capture.
//
// a typical pose reference tool has a Take Screenshot / Reset / Lock / Unlock / FOV camera panel.
// Poseify persists a camera only inside a saved scene, so an artist cannot park
// a framing and come back to it while posing something else.
//
// Framework-free and Three-only so it can be unit tested without a renderer,
// matching the style of PoseController and ObjectController.

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraPose } from "../prefs/CameraTypes";

export type { CameraPose };

/**
 * The camera state the app opens with.
 *
 * Hardcoded rather than read back from the Viewport constructor so Reset has a
 * single definition that both the app and the tests read. Duplicating these
 * numbers in two places is how a reset drifts away from the opening view.
 */
export const DEFAULT_CAMERA_POSE: Omit<CameraPose, "name"> = {
  position: [2.4, 2.0, 3.2],
  target: [0, 0.9, 0],
  fov: 50,
};

export function readCameraPose(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  name = "Untitled view",
): CameraPose {
  return {
    name,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    fov: camera.fov,
  };
}

export class CameraRig {
  private locked = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  get isLocked(): boolean {
    return this.locked;
  }

  /**
   * Freeze or release orbit input, returning the new state.
   *
   * Damping is switched off while locked: OrbitControls keeps integrating
   * velocity after the last input, so a locked camera would still drift for a
   * frame or two and read as a lock that does not work.
   */
  setLocked(locked: boolean): boolean {
    this.locked = locked;
    this.controls.enabled = !locked;
    this.controls.enableDamping = !locked;
    return locked;
  }

  toggleLock(): boolean {
    return this.setLocked(!this.locked);
  }

  /** Return to the opening framing. */
  reset(): CameraPose {
    this.apply({
      name: "Default",
      position: [...DEFAULT_CAMERA_POSE.position],
      target: [...DEFAULT_CAMERA_POSE.target],
      fov: DEFAULT_CAMERA_POSE.fov,
    });
    return readCameraPose(this.camera, this.controls, "Default");
  }

  /**
   * Move the camera to a stored framing.
   *
   * controls.update() is required after writing the target, or the orbit maths
   * re-derives the camera position from the stale one and undoes the move.
   */
  apply(pose: CameraPose): void {
    this.camera.position.fromArray(pose.position);
    this.camera.fov = pose.fov;
    this.camera.updateProjectionMatrix();
    this.controls.target.fromArray(pose.target);
    this.controls.update();
  }

  current(name = "Untitled view"): CameraPose {
    return readCameraPose(this.camera, this.controls, name);
  }

  /**
   * Capture the current viewport as a PNG data URL.
   *
   * A viewport capture rather than a render pass: it grabs what the artist is
   * looking at, including the grid, light gizmo and prop helpers, which an
   * export deliberately hides. The renderer is constructed with
   * preserveDrawingBuffer for exactly this reason; without it the buffer is
   * cleared after presentation and toDataURL returns a blank image.
   */
  screenshot(): string | null {
    try {
      return this.canvas.toDataURL("image/png");
    } catch {
      // A tainted canvas throws. Nothing is drawn cross-origin today, but a
      // future imported texture could, and a silent null beats a crash.
      return null;
    }
  }
}
