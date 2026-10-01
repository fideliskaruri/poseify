import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { exportSceneObj } from "../ObjExport";

/**
 * Whole-scene OBJ export: models and props in one file.
 *
 * The part that breaks silently is index offsetting. OBJ face indices are
 * absolute across the file, not per object, so a second object's faces must be
 * shifted past everything written before it. A wrong offset still imports into
 * Blender and simply shows the wrong geometry, which is the worst failure mode.
 */

/** A box mesh with a known, small face count so offsets are exact integers. */
function box(faceCount = 2, position = new THREE.Vector3()): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  geometry.setIndex(
    Array.from({ length: faceCount * 3 }, (_, i) => i % (faceCount * 2)),
  );
  mesh.position.copy(position);
  return mesh;
}

function rootWith(children: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Group();
  for (const child of children) root.add(child);
  return root;
}

function faces(text: string): string[] {
  return text.split("\n").filter((l) => l.startsWith("f "));
}

function verts(text: string): string[] {
  return text.split("\n").filter((l) => l.startsWith("v "));
}

describe("exportSceneObj", () => {
  it("writes a header and one group per source", () => {
    const text = exportSceneObj([
      { name: "figure", root: rootWith([box()]) },
      { name: "chair", root: rootWith([box()]) },
    ]);
    expect(text).toContain("# Poseify scene export");
    expect(text).toContain("o scene");
    expect(text).toContain("# figure");
    expect(text).toContain("# chair");
  });

  it("emits vertices from every source", () => {
    const text = exportSceneObj([
      { name: "a", root: rootWith([box()]) },
      { name: "b", root: rootWith([box()]) },
    ]);
    expect(verts(text).length).toBe(verts(exportSceneObj([{ name: "a", root: rootWith([box()]) }])).length * 2);
  });

  it("offsets the second object's face indices past the first", () => {
    const solo = exportSceneObj([{ name: "solo", root: rootWith([box(2)]) }]);
    const firstVerts = verts(solo).length;
    const text = exportSceneObj([
      { name: "a", root: rootWith([box(2)]) },
      { name: "b", root: rootWith([box(2)]) },
    ]);
    const totalVerts = verts(text).length;
    const lines = faces(text);
    expect(lines.length).toBeGreaterThan(1);

    let maxIndex = 0;
    for (const line of lines) {
      for (const corner of line.slice(2).trim().split(/\s+/)) {
        const v = Number(corner.split("/")[0]);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(totalVerts);
        if (v > maxIndex) maxIndex = v;
      }
    }
    // If the offset were dropped, the second object's faces would collide
    // with the first object's range. Assert the real invariant instead: the
    // merged file stays in range, and the second object starts past the first.
    const half = Math.floor(lines.length / 2);
    const secondHalf = lines.slice(half).flatMap((l) =>
      l.slice(2).trim().split(/\s+/).map((c) => Number(c.split("/")[0])),
    );
    expect(secondHalf.length).toBeGreaterThan(0);
    expect(Math.min(...secondHalf)).toBeGreaterThan(firstVerts);
    expect(maxIndex).toBeLessThanOrEqual(totalVerts);
  });

  it("keeps a single-object export's indices in range", () => {
    const text = exportSceneObj([{ name: "solo", root: rootWith([box(2)]) }]);
    const totalVerts = verts(text).length;
    for (const line of faces(text)) {
      for (const corner of line.slice(2).trim().split(/\s+/)) {
        const v = Number(corner.split("/")[0]);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(totalVerts);
      }
    }
  });

  it("skips a source with no geometry rather than emitting a stub group", () => {
    const text = exportSceneObj([
      { name: "empty", root: new THREE.Group() },
      { name: "real", root: rootWith([box()]) },
    ]);
    expect(text).not.toContain("# empty");
    expect(text).toContain("# real");
  });

  it("bakes world transforms so a moved prop exports in place", () => {
    const text = exportSceneObj([
      { name: "moved", root: rootWith([box(2, new THREE.Vector3(5, 0, 0))]) },
    ]);
    const maxX = Math.max(...verts(text).map((l) => Number(l.split(" ")[1])));
    expect(maxX).toBeGreaterThan(5);
  });

  it("merges more than two objects without index drift", () => {
    const sources = ["a", "b", "c", "d"].map((n) => ({
      name: n,
      root: rootWith([box(2)]),
    }));
    const text = exportSceneObj(sources);
    const totalVerts = verts(text).length;
    const indices = faces(text).flatMap((line) =>
      line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((c) => Number(c.split("/")[0])),
    );
    // Four boxes write four times the geometry of one, so the distinct index
    // count must grow with the number of objects. Without offsets every object
    // would reuse the same small index range.
    const single = faces(
      exportSceneObj([{ name: "a", root: rootWith([box(2)]) }]),
    ).flatMap((line) =>
      line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((c) => Number(c.split("/")[0])),
    );
    expect(new Set(indices).size).toBeGreaterThanOrEqual(
      new Set(single).size * 2,
    );
    expect(Math.max(...indices)).toBeLessThanOrEqual(totalVerts);
  });
});


