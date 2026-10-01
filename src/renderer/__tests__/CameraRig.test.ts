import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CameraRig,
  DEFAULT_CAMERA_POSE,
  readCameraPose,
} from "../CameraRig";
import { validateCameraPreses } from "../../prefs/CameraPresets";

/**
 * Camera lock, reset, presets and capture.
 *
 * The locking case that matters: OrbitControls keeps integrating damping
 * velocity after the last input, so naively disabling `enabled` still lets the
 * camera drift for a frame or two, which reads as a lock that does not work.
 */

/**
 * A DOM-less stand-in for the renderer canvas.
 *
 * OrbitControls binds pointer listeners in its constructor, so the element has
 * to carry addEventListener and setPointerCapture even though these tests
 * never dispatch a pointer event.
 */
function fakeCanvas(): HTMLCanvasElement {
  const el = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getRootNode: () => el,
    style: {},
    toDataURL: () => "data:image/png;base64,stub",
  };
  return el as unknown as HTMLCanvasElement;
}

function makeRig() {
  const canvas = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  camera.position.set(2.4, 2.0, 3.2);
  const controls = new OrbitControls(camera, canvas as unknown as HTMLElement);
  controls.target.set(0, 0.9, 0);
  controls.update();
  return { camera, controls, rig: new CameraRig(camera, controls, canvas) };
}

describe("CameraRig lock", () => {
  it("starts unlocked", () => {
    const { rig, controls } = makeRig();
    expect(rig.isLocked).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it("disables orbit input and damping when locked", () => {
    const { rig, controls } = makeRig();
    rig.setLocked(true);
    expect(rig.isLocked).toBe(true);
    expect(controls.enabled).toBe(false);
    // Damping left on would keep integrating velocity after the last drag.
    expect(controls.enableDamping).toBe(false);
  });

  it("restores orbit input and damping when unlocked", () => {
    const { rig, controls } = makeRig();
    rig.setLocked(true);
    rig.setLocked(false);
    expect(controls.enabled).toBe(true);
    expect(controls.enableDamping).toBe(true);
  });

  it("toggles, and returns the resulting state", () => {
    const { rig } = makeRig();
    expect(rig.toggleLock()).toBe(true);
    expect(rig.toggleLock()).toBe(false);
  });

  it("survives ten lock/unlock cycles with the same end state", () => {
    const { rig, controls } = makeRig();
    for (let i = 0; i < 10; i += 1) {
      rig.setLocked(true);
      rig.setLocked(false);
    }
    expect(rig.isLocked).toBe(false);
    expect(controls.enabled).toBe(true);
  });
});

describe("CameraRig reset", () => {
  it("returns to the documented default framing", () => {
    const { rig, camera, controls } = makeRig();
    camera.position.set(9, 9, 9);
    controls.target.set(5, 5, 5);
    camera.fov = 90;

    rig.reset();
    // OrbitControls.update() runs spherical maths, so the restored values land
    // within float tolerance rather than exactly.
    expect(camera.position.x).toBeCloseTo(DEFAULT_CAMERA_POSE.position[0], 10);
    expect(camera.position.y).toBeCloseTo(DEFAULT_CAMERA_POSE.position[1], 10);
    expect(camera.position.z).toBeCloseTo(DEFAULT_CAMERA_POSE.position[2], 10);
    expect(controls.target.x).toBeCloseTo(DEFAULT_CAMERA_POSE.target[0], 10);
    expect(controls.target.y).toBeCloseTo(DEFAULT_CAMERA_POSE.target[1], 10);
    expect(controls.target.z).toBeCloseTo(DEFAULT_CAMERA_POSE.target[2], 10);
    expect(camera.fov).toBe(DEFAULT_CAMERA_POSE.fov);
  });

  it("recomputes the projection so the restored fov actually applies", () => {
    const { rig, camera } = makeRig();
    camera.fov = 15;
    camera.updateProjectionMatrix();
    const narrow = camera.projectionMatrix.elements[5];
    rig.reset();
    // A wider fov must produce a different projection scale, which only
    // happens if updateProjectionMatrix ran.
    expect(camera.fov).toBe(DEFAULT_CAMERA_POSE.fov);
    expect(camera.projectionMatrix.elements[5]).not.toBeCloseTo(narrow, 6);
  });
});

describe("CameraRig presets", () => {
  it("applies a stored framing exactly", () => {
    const { rig, camera, controls } = makeRig();
    rig.apply({
      name: "Low angle",
      position: [0, 0.5, 4],
      target: [0, 1, 0],
      fov: 35,
    });
    expect(camera.position.x).toBeCloseTo(0, 10);
    expect(camera.position.y).toBeCloseTo(0.5, 10);
    expect(camera.position.z).toBeCloseTo(4, 10);
    expect(controls.target.x).toBeCloseTo(0, 10);
    expect(controls.target.y).toBeCloseTo(1, 10);
    expect(controls.target.z).toBeCloseTo(0, 10);
    expect(camera.fov).toBe(35);
  });

  it("reads the current framing back out", () => {
    const { rig, camera, controls } = makeRig();
    camera.position.set(1, 2, 3);
    controls.target.set(0, 1, 0);
    camera.fov = 42;
    const pose = rig.current("Mine");
    expect(pose.name).toBe("Mine");
    expect(pose.fov).toBe(42);
    expect(pose.position).toEqual([1, 2, 3]);
    expect(pose.target).toEqual([0, 1, 0]);
  });

  it("round-trips a preset through save and load", () => {
    const { rig } = makeRig();
    rig.apply({
      name: "Saved",
      position: [-2, 1.5, 2],
      target: [0, 1, 0],
      fov: 30,
    });
    const saved = rig.current("Saved");
    rig.reset();
    rig.apply(saved);
    const back = rig.current("Saved");
    expect(back.fov).toBeCloseTo(saved.fov, 10);
    for (let i = 0; i < 3; i += 1) {
      expect(back.position[i]).toBeCloseTo(saved.position[i], 9);
      expect(back.target[i]).toBeCloseTo(saved.target[i], 9);
    }
  });
});

describe("readCameraPose", () => {
  it("returns finite numbers for a live camera", () => {
    const { camera, controls } = makeRig();
    const pose = readCameraPose(camera, controls);
    for (const n of [...pose.position, ...pose.target, pose.fov]) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe("screenshot", () => {
  it("returns the canvas data URL", () => {
    const { rig } = makeRig();
    expect(rig.screenshot()).toBe("data:image/png;base64,stub");
  });
});

