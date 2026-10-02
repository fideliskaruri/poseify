import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PROCEDURAL_CATALOG,
  buildProceduralModel,
  proceduralLoadConfig,
} from "../ProceduralModels";
import { PosableSkeleton } from "../../posing/PosableSkeleton";
import { retargetSkeleton } from "../../rig/Retargeter";
import { ALL_BONES, CORE_BONES, validateSkeleton } from "../../rig/RigContract";

/**
 * Procedural figures.
 *
 * These are the licence-clean model path: everything generated from the rig
 * contract, so a fresh clone has something poseable with zero downloads. The
 * assertions are about them being *usable*, not just present: a figure that
 * fails the contract would load and then refuse to pose.
 */

describe("procedural catalogue", () => {
  it("ships at least six figures", () => {
    expect(PROCEDURAL_CATALOG.length).toBeGreaterThanOrEqual(6);
  });

  it("gives every figure a distinct id and a distinct proportion set", () => {
    // A library where every body is the same shape is not a library.
    const ids = new Set(PROCEDURAL_CATALOG.map((p) => p.id));
    expect(ids.size).toBe(PROCEDURAL_CATALOG.length);
    const shapes = new Set(
      PROCEDURAL_CATALOG.map((p) => `${p.scale}:${p.build}`),
    );
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it("produces a load config with no file, so it is never treated as vendor", () => {
    for (const entry of PROCEDURAL_CATALOG) {
      const config = proceduralLoadConfig(entry);
      expect(config.id).toBe(entry.id);
      expect((config as { file?: string }).file).toBeUndefined();
      expect(config.exportable).toBe(true);
    }
  });
});

describe("buildProceduralModel", () => {
  it("builds every figure on the full rig contract", () => {
    for (const entry of PROCEDURAL_CATALOG) {
      const root = buildProceduralModel(entry);
      const result = retargetSkeleton(root, { requireHands: true });
      expect(result.ok).toBe(true);
      // A figure whose bones silently failed to bind would pose as a T-pose
      // regardless of what the artist selects.
      for (const bone of ALL_BONES) {
        expect(result.matches.has(bone)).toBe(true);
      }
    }
  });

  it("produces geometry a SkinnedMesh can render", () => {
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    let mesh: THREE.SkinnedMesh | null = null;
    root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) mesh = child as THREE.SkinnedMesh;
    });
    expect(mesh).not.toBeNull();
    const geometry = (mesh as unknown as THREE.SkinnedMesh).geometry;
    expect(geometry.getAttribute("position").count).toBeGreaterThan(100);
    expect(geometry.getAttribute("skinWeight").count).toBe(
      geometry.getAttribute("position").count,
    );
    expect(geometry.index).not.toBeNull();
  });

  it("gives every vertex a single bone, so posing cannot tear the mesh", () => {
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    let mesh: THREE.SkinnedMesh | null = null;
    root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) mesh = child as THREE.SkinnedMesh;
    });
    const weights = (mesh as unknown as THREE.SkinnedMesh).geometry.getAttribute("skinWeight");
    for (let i = 0; i < weights.count; i += 1) {
      const total = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("binds in attached mode, so a post-bind root move applies once", () => {
    // Detached freezes the bind matrix, so a transform applied after binding -
    // and attachModel fans models out along X - is applied twice. Attached
    // recomputes it each frame, which is correct because the vertex data is
    // authored in the same space as the bone rest transforms.
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    let mesh: THREE.SkinnedMesh | null = null;
    root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) mesh = child as THREE.SkinnedMesh;
    });
    const skinned = mesh as unknown as THREE.SkinnedMesh;
    expect(skinned.bindMode).toBe("attached");

    // The move attachModel performs must not disturb the geometry.
    const measure = (): number => {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      const count = skinned.geometry.getAttribute("position").count;
      for (let i = 0; i < count; i += 1) {
        skinned.getVertexPosition(i, v);
        box.expandByPoint(skinned.localToWorld(v));
      }
      return box.getSize(new THREE.Vector3()).length();
    };
    const before = measure();
    root.position.x = 1.1;
    expect(measure()).toBeCloseTo(before, 5);
  });

  it("varies height between figures", () => {
    // Measured from bone rest positions rather than Box3.setFromObject: a
    // SkinnedMesh whose skeleton bones are not all its own descendants makes
    // three's box traversal dereference an undefined parent, and figure height
    // is a property of the rig, not of the mesh.
    const measure = (entry: (typeof PROCEDURAL_CATALOG)[number]): number => {
      const root = buildProceduralModel(entry);
      let maxY = -Infinity;
      root.traverse((child) => {
        const bone = child as THREE.Bone;
        if (!bone.isBone) return;
        const world = new THREE.Vector3();
        bone.getWorldPosition(world);
        if (world.y > maxY) maxY = world.y;
      });
      return maxY;
    };
    const neutral = measure(PROCEDURAL_CATALOG[0]);
    const child = PROCEDURAL_CATALOG.find((p) => p.id === "figure_child")!;
    expect(measure(child)).toBeLessThan(neutral * 0.8);
  });

  it("stands on the floor rather than sinking through it", () => {
    for (const entry of PROCEDURAL_CATALOG) {
      const root = buildProceduralModel(entry);
      let minY = Infinity;
      root.traverse((child) => {
        const bone = child as THREE.Bone;
        if (!bone.isBone) return;
        const world = new THREE.Vector3();
        bone.getWorldPosition(world);
        if (world.y < minY) minY = world.y;
      });
      // Below the floor means the rest pose is wrong, and every pose built on
      // it would start underground.
      expect(minY).toBeGreaterThan(-0.05);
    }
  });

  it("can be posed and reports no missing bones", () => {
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    const skeleton = new PosableSkeleton(root, proceduralLoadConfig(PROCEDURAL_CATALOG[0]), {
      bindHands: true,
    });
    expect(skeleton.isValid).toBe(true);
    expect(validateSkeleton(skeleton.getBoneNames(), { requireHands: true }).ok).toBe(true);

    skeleton.applyPose({
      LeftArm: [0, 0, 1.2],
      RightArm: [0, 0, -1.2],
      Spine: [0.2, 0.3, 0],
    });
    // A rotation that did not take is the failure this guards: the figure
    // would sit in its rest pose while the UI reported success.
    const left = skeleton.getBone("LeftArm")!;
    expect(Math.abs(left.quaternion.z)).toBeGreaterThan(0.2);
  });

  it("skins without dereferencing a missing parent", () => {
    // Regression guard. SkinnedMesh.applyBoneTransform walks the mesh's own
    // ancestors to reach each skeleton bone, so a mesh bound while still
    // detached from its group throws on the first real render. The figure
    // still *posed* correctly, because posing touches bones directly and never
    // runs the skinning path - so this only shows up as an empty thumbnail.
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    let mesh: THREE.SkinnedMesh | null = null;
    root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) mesh = child as THREE.SkinnedMesh;
    });
    const skinned = mesh as unknown as THREE.SkinnedMesh;
    expect(skinned.parent).toBe(root);

    // Drive the exact path a render takes, with no GL context needed.
    // getVertexPosition is the public entry point a raycast or an edit uses,
    // and it calls applyBoneTransform with a *vertex* index - so the loop must
    // be over vertex count, not the index buffer's count.
    root.updateMatrixWorld(true);
    skinned.skeleton.update();
    const vertexCount = skinned.geometry.getAttribute("position").count;
    expect(() => {
      for (let i = 0; i < vertexCount; i += 1) {
        skinned.getVertexPosition(i, new THREE.Vector3());
      }
    }).not.toThrow();
  });

  it("exports a usable OBJ vertex count", () => {
    // The OBJ exporter walks meshes, so an empty figure would export nothing.
    const root = buildProceduralModel(PROCEDURAL_CATALOG[0]);
    let verts = 0;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) verts += mesh.geometry.getAttribute("position").count;
    });
    expect(verts).toBeGreaterThan(100);
  });
});




