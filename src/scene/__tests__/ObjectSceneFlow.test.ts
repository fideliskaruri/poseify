import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { emptyScene, parseScene, sceneToJson, type SceneState } from "../Scene";
import {
  applyTransform,
  duplicateOffset,
  isHidden,
  readObjectState,
  readTransform,
  setHidden,
  setLocked,
} from "../ObjectState";

/**
 * End-to-end shape of the Phase 1 flow, minus the renderer.
 *
 * Mirrors what the browser check does: load one model, duplicate it, hide the
 * copy, capture the scene, serialise, parse, and re-apply onto fresh objects.
 * The browser proved the path works; these assertions pin it so a regression
 * is caught without a GPU.
 */
function makeFigure(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.4),
    new THREE.MeshStandardMaterial({ color: "#cccccc" }),
  );
  mesh.name = "body";
  root.add(mesh);
  return root;
}

/** Build the scene data the app captures for one model plus its duplicate. */
function captureWithDuplicate(): SceneState {
  const scene = emptyScene("Untitled");
  const original = makeFigure();
  const clone = makeFigure();
  clone.position.x = duplicateOffset(original);
  setHidden(clone, true);

  scene.models.push({
    id: "mannequin_male",
    pose: {},
    transform: readTransform(original),
  });
  scene.models.push({
    id: "mannequin_male",
    pose: {},
    transform: readTransform(clone),
    state: readObjectState(clone),
  });
  return scene;
}

describe("object scene flow", () => {
  it("captures both copies, serialises and reparses them", () => {
    const scene = captureWithDuplicate();
    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models).toHaveLength(2);
    expect(restored.models[0].state).toBeUndefined();
    expect(restored.models[1].state).toEqual({ hidden: true });
  });

  it("reapplies both copies with the hidden flag intact", () => {
    const restored = parseScene(sceneToJson(captureWithDuplicate()))!;

    const freshA = makeFigure();
    const freshB = makeFigure();
    applyTransform(freshA, restored.models[0].transform);
    applyTransform(freshB, restored.models[1].transform);
    if (restored.models[1].state?.hidden) setHidden(freshB, true);

    // Two distinct instances, offset so they read as separate.
    expect(freshB.position.x - freshA.position.x).toBeGreaterThan(0.4);
    expect(isHidden(freshA)).toBe(false);
    expect(isHidden(freshB)).toBe(true);
  });

  it("keeps lock independent of hidden", () => {
    const scene = emptyScene("LockOnly");
    const a = makeFigure();
    const b = makeFigure();
    setLocked(b, true);
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(a),
    });
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(b),
      state: readObjectState(b),
    });

    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models[1].state).toEqual({ locked: true });
    expect(restored.models[1].state?.hidden).toBeUndefined();
  });

  it("survives a double round-trip without drift", () => {
    const once = parseScene(sceneToJson(captureWithDuplicate()))!;
    const twice = parseScene(sceneToJson(once))!;
    expect(twice).toEqual(once);
  });
});
