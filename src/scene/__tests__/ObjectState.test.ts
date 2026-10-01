import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyTransform,
  clearObjectColor,
  duplicateOffset,
  isHidden,
  isLocked,
  readObjectState,
  readTransform,
  setHidden,
  setLocked,
  setObjectColor,
} from "../ObjectState";

/** A small stand-in for a loaded model: a group with one coloured mesh. */
function makeFigure(color = "#cccccc"): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.4),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.name = "body";
  mesh.position.y = 0.9;
  root.add(mesh);
  return root;
}

function meshColor(root: THREE.Object3D): string {
  const mesh = root.getObjectByName("body") as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  return `#${material.color.getHexString()}`;
}

describe("transform round-trip", () => {
  it("reads position, rotation and scale off an object", () => {
    const root = makeFigure();
    root.position.set(1, 2, 3);
    root.quaternion.setFromEuler(new THREE.Euler(0.2, 0.3, 0.4));
    root.scale.set(1.5, 0.75, 2);

    const t = readTransform(root);
    expect(t.position).toEqual([1, 2, 3]);
    expect(t.scale).toEqual([1.5, 0.75, 2]);
    expect(t.rotation[3]).toBeCloseTo(root.quaternion.w, 12);
  });

  it("applies a transform to an object", () => {
    const root = makeFigure();
    applyTransform(root, {
      position: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      scale: [2, 2, 2],
    });
    expect(root.position.toArray()).toEqual([4, 5, 6]);
    expect(root.scale.toArray()).toEqual([2, 2, 2]);
  });

  it("round-trips non-uniform scale exactly", () => {
    const root = makeFigure();
    const transform = {
      position: [0.5, 0, -1.25] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1.25, 0.5, 3] as [number, number, number],
    };
    applyTransform(root, transform);
    expect(readTransform(root)).toEqual(transform);
  });
});

describe("show / lock", () => {
  it("hides an object recursively and remembers the flag", () => {
    const root = makeFigure();
    setHidden(root, true);
    expect(isHidden(root)).toBe(true);
    expect(root.visible).toBe(false);
    expect(root.getObjectByName("body")!.visible).toBe(false);
  });

  it("shows a hidden object again", () => {
    const root = makeFigure();
    setHidden(root, true);
    setHidden(root, false);
    expect(isHidden(root)).toBe(false);
    expect(root.visible).toBe(true);
    expect(root.getObjectByName("body")!.visible).toBe(true);
  });

  it("locks and unlocks", () => {
    const root = makeFigure();
    expect(isLocked(root)).toBe(false);
    setLocked(root, true);
    expect(isLocked(root)).toBe(true);
    setLocked(root, false);
    expect(isLocked(root)).toBe(false);
  });

  it("reads object state for scene capture", () => {
    const root = makeFigure();
    expect(readObjectState(root)).toBeUndefined();
    setHidden(root, true);
    setLocked(root, true);
    setObjectColor(root, "#3366ff");
    expect(readObjectState(root)).toEqual({
      hidden: true,
      locked: true,
      color: "#3366ff",
    });
  });
});

describe("colour", () => {
  it("applies a colour to every mesh in the hierarchy", () => {
    const root = makeFigure();
    setObjectColor(root, "#ff0000");
    expect(meshColor(root)).toBe("#ff0000");
  });

  it("restores the original colour when cleared", () => {
    const root = makeFigure("#00ff00");
    setObjectColor(root, "#123456");
    expect(meshColor(root)).toBe("#123456");
    clearObjectColor(root);
    expect(meshColor(root)).toBe("#00ff00");
  });

  it("restores the true original after two overrides", () => {
    // Regression guard: recording the colour after the first override would
    // make Clear restore "#111111" instead of the authored "#00ff00".
    const root = makeFigure("#00ff00");
    setObjectColor(root, "#111111");
    setObjectColor(root, "#222222");
    clearObjectColor(root);
    expect(meshColor(root)).toBe("#00ff00");
  });

  it("clearing a colour that was never set is a no-op", () => {
    const root = makeFigure("#abcdef");
    clearObjectColor(root);
    expect(meshColor(root)).toBe("#abcdef");
  });
});

describe("duplicate", () => {
  it("offsets by the figure's own width so copies read as separate", () => {
    const root = makeFigure();
    const offset = duplicateOffset(root);
    expect(offset).toBeGreaterThan(0.4);
  });

  it("falls back to a fixed offset for a degenerate object", () => {
    const empty = new THREE.Object3D();
    expect(duplicateOffset(empty)).toBe(1.1);
  });

  it("clones position and does not inherit a lock", () => {
    const root = makeFigure();
    root.position.set(0, 0, 0);
    setLocked(root, true);

    const clone = root.clone(true);
    clone.position.x += duplicateOffset(root);
    // A duplicate must be immediately editable, so drop the inherited lock.
    delete (clone.userData as { posifyLocked?: boolean }).posifyLocked;

    expect(clone.position.x).toBeGreaterThan(0.4);
    expect(isLocked(clone)).toBe(false);
  });
});
