import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { exportSceneObj } from "../ObjExport";
import { isHidden, setHidden } from "../../scene/ObjectState";

/**
 * Scene OBJ must contain what is actually in the scene.
 *
 * The browser check for this could not complete: the in-app browser does not
 * surface the download event, so the exported bytes could not be read back.
 * These assertions cover the same claim - a figure and a prop both land in one
 * file, and a hidden prop does not.
 */
function prop(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.9, 0.5),
    new THREE.MeshStandardMaterial({ color: "#885522" }),
  );
  mesh.position.set(1.2, 0.45, 0);
  root.add(mesh);
  return root;
}

function figure(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 1.4, 4, 8),
    new THREE.MeshStandardMaterial({ color: "#cccccc" }),
  );
  mesh.position.y = 0.9;
  root.add(mesh);
  return root;
}

describe("scene OBJ contents", () => {
  it("includes a figure and a prop in one file", () => {
    const text = exportSceneObj([
      { name: "mannequin_male", root: figure() },
      { name: "chair", root: prop() },
    ]);
    expect(text).toContain("# mannequin_male");
    expect(text).toContain("# chair");
    // Both contribute geometry, so the merged file has strictly more vertices
    // than the figure alone.
    const count = (t: string): number => (t.match(/^v /gm) ?? []).length;
    const figureOnly = exportSceneObj([
      { name: "mannequin_male", root: figure() },
    ]);
    expect(count(text)).toBeGreaterThan(count(figureOnly));
  });

  it("omits a hidden prop, matching what the artist can see", () => {
    const chair = prop();
    setHidden(chair, true);
    expect(isHidden(chair)).toBe(true);

    const text = exportSceneObj([
      { name: "mannequin_male", root: figure() },
      { name: "chair", root: chair },
    ]);
    expect(text).not.toContain("# chair");
    expect(text).toContain("# mannequin_male");
  });
});
