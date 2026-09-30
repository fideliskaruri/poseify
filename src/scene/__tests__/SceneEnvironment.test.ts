import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SceneEnvironment } from "../SceneEnvironment";

function makeCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 500);
}

describe("SceneEnvironment - FOV", () => {
  it("setFov changes the projection, not just a stored value", () => {
    const camera = makeCamera();
    const env = new SceneEnvironment(camera);

    env.setFov(90);
    expect(camera.fov).toBe(90);
    expect(env.getFov()).toBe(90);
    const wide = camera.projectionMatrix.elements[0];

    env.setFov(20);
    const narrow = camera.projectionMatrix.elements[0];
    expect(narrow).toBeGreaterThan(wide);
    env.dispose();
  });

  it("clamps FOV to a usable range", () => {
    const camera = makeCamera();
    const env = new SceneEnvironment(camera);
    env.setFov(500);
    expect(camera.fov).toBe(120);
    env.setFov(-40);
    expect(camera.fov).toBe(5);
    env.dispose();
  });

  it("a narrow FOV exaggerates depth separation more than a wide one", () => {
    const camera = makeCamera();
    const env = new SceneEnvironment(camera);

    // Pull the camera back so projection is well defined; a camera at the
    // origin divides by zero and yields NaN.
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    // Two points offset from the view axis, one metre apart in depth. Measuring
    // their separation in normalised device coordinates shows how strongly the
    // lens exaggerates that depth difference: a long lens (narrow FOV) makes
    // near and far spread apart, a wide lens compresses them together. That is
    // the "dramatic perspective" an artist reaches for.
    const near = new THREE.Vector3(1, 0, 0);
    const far = new THREE.Vector3(1, 0, -1);

    env.setFov(20);
    const a1 = near.clone().project(camera);
    const b1 = far.clone().project(camera);
    const narrowSpan = Math.abs(a1.x - b1.x);

    env.setFov(100);
    const a2 = near.clone().project(camera);
    const b2 = far.clone().project(camera);
    const wideSpan = Math.abs(a2.x - b2.x);

    expect(narrowSpan).toBeGreaterThan(wideSpan);
    expect(narrowSpan).toBeGreaterThan(0);
    env.dispose();
  });
});

describe("SceneEnvironment - light direction", () => {
  it("places the light from azimuth and elevation", () => {
    const env = new SceneEnvironment(makeCamera());

    // Straight overhead: horizontal components vanish by definition.
    env.setLight({ azimuth: 0, elevation: 90, distance: 10 });
    expect(env.light.position.x).toBeCloseTo(0, 4);
    expect(env.light.position.y).toBeCloseTo(10, 3);
    expect(env.light.position.z).toBeCloseTo(0, 4);

    // Azimuth 90 swings the light onto the +X side.
    env.setLight({ azimuth: 90, elevation: 90, distance: 10 });
    env.setLight({ azimuth: 90, elevation: 45, distance: 10 });
    expect(env.light.position.x).toBeCloseTo(10 * Math.cos(Math.PI / 4), 2);
    expect(env.light.position.y).toBeCloseTo(10 * Math.sin(Math.PI / 4), 2);
    expect(env.light.position.z).toBeCloseTo(0, 3);
    env.dispose();
  });

  it("elevation 0 puts the light at the horizon, 90 overhead", () => {
    const env = new SceneEnvironment(makeCamera());
    // Elevation is clamped to >= 1 degree so the direction stays defined, so
    // "horizon" means the lowest reachable angle rather than exactly 0.
    env.setLight({ azimuth: 45, elevation: 0, distance: 8 });
    expect(env.light.position.y).toBeLessThan(0.2);
    expect(Math.abs(env.light.position.y)).toBeLessThan(
      8 * Math.sin(Math.PI / 90) + 0.01,
    );

    env.setLight({ azimuth: 45, elevation: 90, distance: 8 });
    expect(env.light.position.y).toBeCloseTo(8, 3);
    env.dispose();
  });

  it("keeps the light a finite distance from the origin at any angle", () => {
    const env = new SceneEnvironment(makeCamera());
    for (const elevation of [1, 45, 90, 179]) {
      env.setLight({ elevation, azimuth: 123, distance: 7 });
      expect(env.light.position.length()).toBeCloseTo(7, 3);
    }
    env.dispose();
  });

  it("intensity and shadow toggles reach the light", () => {
    const env = new SceneEnvironment(makeCamera());
    env.setLight({ intensity: 0.5, castShadows: false });
    expect(env.light.intensity).toBe(0.5);
    expect(env.light.castShadow).toBe(false);

    env.setLight({ castShadows: true });
    expect(env.light.castShadow).toBe(true);
    env.dispose();
  });

  it("the light gizmo sits at the light and points at the origin", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);

    env.setLight({ azimuth: 30, elevation: 40, distance: 11 });
    const gizmo = scene.getObjectByName("LightGizmo")!;
    expect(gizmo).toBeDefined();
    expect(gizmo.position.distanceTo(env.light.position)).toBeLessThan(1e-5);

    // Object3D.lookAt aims +Z at the target, so +Z is the direction from the
    // light toward the subject. The arrow geometry is modelled along -Z so it
    // reads as pointing inward.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(gizmo.quaternion);
    const toOrigin = env.light.position.clone().negate().normalize();
    expect(forward.dot(toOrigin)).toBeCloseTo(1, 3);
    env.dispose();
  });

  it("toggles gizmo visibility", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);
    const gizmo = scene.getObjectByName("LightGizmo")!;

    env.setLightGizmoVisible(false);
    expect(gizmo.visible).toBe(false);
    expect(env.lightGizmoVisible).toBe(false);

    env.setLightGizmoVisible(true);
    expect(gizmo.visible).toBe(true);
    env.dispose();
  });

  it("shadow camera covers the scene bounds", () => {
    const env = new SceneEnvironment(makeCamera());
    env.boundsRadius = 10;
    env.setLight({ intensity: 1 });
    const cam = env.light.shadow.camera;
    expect(cam.right).toBeGreaterThanOrEqual(10);
    expect(cam.top).toBeGreaterThanOrEqual(10);
    expect(cam.left).toBe(-cam.right);
    env.dispose();
  });
});

describe("SceneEnvironment - grid", () => {
  it("builds a minor and a major grid layer", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);

    expect(scene.getObjectByName("GridMinor")).toBeDefined();
    expect(scene.getObjectByName("GridMajor")).toBeDefined();
    env.dispose();
  });

  it("cell size changes the grid extent", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);

    env.setGrid({ cellSize: 1, divisions: 20 });
    const small = scene.getObjectByName("GridMinor") as THREE.GridHelper;
    small.geometry.computeBoundingSphere();
    const smallSize = small.geometry.boundingSphere?.radius ?? 0;

    env.setGrid({ cellSize: 3, divisions: 20 });
    const large = scene.getObjectByName("GridMinor") as THREE.GridHelper;
    large.geometry.computeBoundingSphere();
    const largeSize = large.geometry.boundingSphere?.radius ?? 0;

    expect(largeSize).toBeGreaterThan(smallSize);
    env.dispose();
  });

  it("hides both layers when the grid is toggled off", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);

    env.setGrid({ visible: false });
    expect(scene.getObjectByName("GridMinor")!.visible).toBe(false);
    expect(scene.getObjectByName("GridMajor")!.visible).toBe(false);

    env.setGrid({ visible: true });
    expect(scene.getObjectByName("GridMinor")!.visible).toBe(true);
    env.dispose();
  });

  it("clamps grid values to sane ranges", () => {
    const env = new SceneEnvironment(makeCamera());
    env.setGrid({ cellSize: 0, divisions: 0, opacity: 5 });
    const state = env.getGrid();
    expect(state.cellSize).toBeGreaterThan(0);
    expect(state.divisions).toBeGreaterThanOrEqual(2);
    expect(state.opacity).toBeLessThanOrEqual(1);
    env.dispose();
  });

  it("keeps the shadow receiver visible when the grid is hidden", () => {
    const env = new SceneEnvironment(makeCamera());
    const scene = new THREE.Scene();
    env.attach(scene);
    env.setGrid({ visible: false });
    expect(scene.getObjectByName("ShadowPlane")!.visible).toBe(true);
    env.dispose();
  });
});
