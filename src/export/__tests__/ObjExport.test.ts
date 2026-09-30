import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { exportObj } from "../ObjExport";
import {
  buildFixture,
  makeSkeleton,
} from "../../posing/__tests__/posingFixtures";

/** Weight every vertex to whichever index the Head bone occupies. */
function weightToHead(
  bones: Map<string, THREE.Bone>,
  boneName: string,
): number {
  return [...bones.values()].findIndex((b) => b.name === boneName);
}

function triangleGeometry(boneIndex: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 1.4, 0, 0.2, 1.4, 0, 0.1, 1.2, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2),
  );
  // Every vertex fully weighted to the head bone.
  const idx = new Uint16Array(12);
  const w = new Float32Array(12);
  for (let i = 0; i < 3; i++) {
    idx[i * 4] = boneIndex;
    w[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
  return geometry;
}

/** A minimal skinned mesh with one triangle bound to a contract rig. */
function skinnedTriangle(): THREE.Group {
  const { root, bones } = buildFixture();
  const skeleton = new THREE.Skeleton([...bones.values()]);
  const mesh = new THREE.SkinnedMesh(
    triangleGeometry(weightToHead(bones, "Head")),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = "body";
  mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);
  return root;
}

function parseVertices(obj: string): THREE.Vector3[] {
  return obj
    .split("\n")
    .filter((l) => l.startsWith("v "))
    .map((l) => {
      const parts = l.split(/\s+/);
      return new THREE.Vector3(
        Number(parts[1]),
        Number(parts[2]),
        Number(parts[3]),
      );
    });
}

describe("exportObj", () => {
  it("emits vertices and faces for a skinned mesh", () => {
    const obj = exportObj(skinnedTriangle());
    expect(obj).toContain("# Poseify export");
    expect((obj.match(/^v /gm) ?? [])).toHaveLength(3);
    expect((obj.match(/^f /gm) ?? [])).toHaveLength(1);
  });

  it("uses 1-based indices in faces, as OBJ requires", () => {
    const obj = exportObj(skinnedTriangle());
    const face = obj.split("\n").find((l) => l.startsWith("f "))!;
    const indices = face
      .slice(2)
      .split(" ")
      .map((n) => Number(n.split("/")[0]));
    expect(indices).toEqual([1, 2, 3]);
  });

  it("bakes the pose: rotating a bone moves the exported vertices", () => {
    const restVerts = parseVertices(exportObj(skinnedTriangle()));

    const { root, bones } = buildFixture();
    const skeleton = new THREE.Skeleton([...bones.values()]);
    const mesh = new THREE.SkinnedMesh(
      triangleGeometry(weightToHead(bones, "Head")),
      new THREE.MeshBasicMaterial(),
    );
    mesh.frustumCulled = false;
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(skeleton);

    // Rotate the head bone, which owns every vertex.
    const head = bones.get("Head")!;
    head.quaternion.setFromEuler(new THREE.Euler(0, 0, 1.0));
    root.updateMatrixWorld(true);
    mesh.skeleton.update();

    const posedVerts = parseVertices(exportObj(root));
    expect(restVerts[0].distanceTo(posedVerts[0])).toBeGreaterThan(0.05);
  });

  it("includes UVs and normals only when asked", () => {
    const plain = exportObj(skinnedTriangle());
    expect(plain).not.toContain("vt ");
    expect(plain).not.toContain("vn ");

    const rich = exportObj(skinnedTriangle(), {
      includeUvs: true,
      includeNormals: true,
    });
    expect(rich).toContain("vt ");
  });

  it("writes v/vt triples in face lines when UVs are present", () => {
    const obj = exportObj(skinnedTriangle(), { includeUvs: true });
    const face = obj.split("\n").find((l) => l.startsWith("f "))!;
    expect(face).toMatch(/^f \d+\/\d+ \d+\/\d+ \d+\/\d+$/);
  });

  it("numbers vertices continuously across multiple meshes", () => {
    const root = skinnedTriangle();
    root.add(skinnedTriangle());

    const obj = exportObj(root);
    const faces = obj.split("\n").filter((l) => l.startsWith("f "));
    expect(faces).toHaveLength(2);
    // The second face must not restart numbering at 1.
    expect(
      faces[1]
        .slice(2)
        .split(" ")
        .map((n) => Number(n)),
    ).toEqual([4, 5, 6]);
  });

  it("uses the supplied object name", () => {
    expect(exportObj(skinnedTriangle(), { name: "my-pose" })).toContain(
      "o my-pose",
    );
  });

  it("handles an empty root without throwing", () => {
    const obj = exportObj(new THREE.Group());
    expect(obj).toContain("# Poseify export");
    expect((obj.match(/^v /gm) ?? []).length).toBe(0);
  });

  it("exports a PosableSkeleton root without error", () => {
    expect(exportObj(makeSkeleton().root, { name: "posed" })).toContain(
      "o posed",
    );
  });
});
