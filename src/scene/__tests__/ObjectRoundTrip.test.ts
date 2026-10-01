import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { emptyScene, parseScene, sceneToJson } from "../Scene";
import {
  applyTransform,
  duplicateOffset,
  readObjectState,
  readTransform,
  setHidden,
  setLocked,
  setObjectColor,
} from "../ObjectState";

/**
 * Two instances of the same catalogue model must survive a scene round-trip
 * as two separate entries, each with its own transform and flags.
 *
 * The object picker keys models by index while the scene file keys them only
 * by catalogue id, so anything that deduplicates on id silently drops the
 * second copy. These tests pin the distinction.
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

describe("scene round-trip with object state", () => {
  it("keeps two instances of the same model distinct", () => {
    const scene = emptyScene("Two Copies");
    const a = makeFigure();
    const b = makeFigure();
    b.position.x = 2;

    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(a),
    });
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(b),
    });

    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models).toHaveLength(2);
    expect(restored.models[0].transform.position[0]).toBe(0);
    expect(restored.models[1].transform.position[0]).toBe(2);
  });

  it("restores hidden and locked flags on the right instance", () => {
    const scene = emptyScene("Flags");
    const a = makeFigure();
    const b = makeFigure();
    setHidden(b, true);
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
    expect(restored.models[0].state).toBeUndefined();
    expect(restored.models[1].state).toEqual({ hidden: true, locked: true });
  });

  it("restores a colour override", () => {
    const scene = emptyScene("Colour");
    const a = makeFigure();
    setObjectColor(a, "#ff8800");
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(a),
      state: readObjectState(a),
    });
    const restored = parseScene(sceneToJson(scene))!;
    expect(restored.models[0].state?.color).toBe("#ff8800");
  });

  it("round-trips a translated duplicate at its offset", () => {
    const scene = emptyScene("Offset");
    const original = makeFigure();
    const offset = duplicateOffset(original);
    const clone = makeFigure();
    clone.position.x = offset;

    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(original),
    });
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(clone),
    });

    const restored = parseScene(sceneToJson(scene))!;
    const gap =
      restored.models[1].transform.position[0] -
      restored.models[0].transform.position[0];
    // The duplicate must still read as a separate instance after a reload.
    expect(gap).toBeCloseTo(offset, 6);
    expect(gap).toBeGreaterThan(0.4);
  });

  it("applies a restored transform back onto a fresh object", () => {
    const scene = emptyScene("Reapply");
    const a = makeFigure();
    applyTransform(a, {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1.5, 0.5, 2],
    });
    scene.models.push({
      id: "mannequin_male",
      pose: {},
      transform: readTransform(a),
    });

    const restored = parseScene(sceneToJson(scene))!;
    const fresh = makeFigure();
    applyTransform(fresh, restored.models[0].transform);
    expect(readTransform(fresh)).toEqual(restored.models[0].transform);
  });
});
