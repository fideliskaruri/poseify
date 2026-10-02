import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProceduralModel,
  proceduralLoadConfig,
  PROCEDURAL_CATALOG,
} from "../ProceduralModels";
import { PosableSkeleton } from "../../posing/PosableSkeleton";
import { FULL_PARENTS, ALL_BONES } from "../../rig/RigContract";
import { vendorBonesToPoseData } from "../../pose/VendorPoseLibrary";

/**
 * The procedural figure has to survive posing.
 *
 * Five separate defects made the figure come apart on any pose while
 * rendering perfectly in bind pose, which is why bind-pose screenshots never
 * showed it:
 *
 *  1. The bone list was not deduplicated, so LeftHand and RightHand were built
 *     twice and the second pass detached them from the arms.
 *  2. The bone list was not sorted parent-first. The contract lists Neck before
 *     Spine2, so building in list order parented Neck to the skeleton root and
 *     left Head floating above the hips.
 *  3. Segment vertices were authored in bone-local space. They belong in bind
 *     pose world space - the space boneInverses were computed in - so that
 *     `boneMatrix * boneInverse * vertex` collapses to identity at rest and to
 *     the bone's delta rotation once posed.
 *  4. Finger rest positions were a fixed 12 mm offset regardless of finger or
 *     segment, which bunched all 40 finger bones at the wrist and made a posed
 *     finger throw its segments across the figure.
 *  5. Segments stopped exactly at each joint, so two boxes meeting at a point
 *     left a visible wedge once they rotated apart.
 *
 * These assertions measure the posed mesh the way the renderer does, through
 * getVertexPosition. Measuring the geometry directly goes through the bind
 * frame and passes regardless of all five.
 */

function makeFigure(entry = PROCEDURAL_CATALOG[0]) {
  const root = buildProceduralModel(entry);
  const skeleton = new PosableSkeleton(root, proceduralLoadConfig(entry), {
    bindHands: true,
  });
  return { root, skeleton };
}

function findMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) found = child as THREE.SkinnedMesh;
  });
  if (!found) throw new Error("figure has no SkinnedMesh");
  return found as unknown as THREE.SkinnedMesh;
}

/** Bounds of the mesh as the renderer sees it, after posing. */
function renderedBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const mesh = findMesh(root);
  const count = mesh.geometry.getAttribute("position").count;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    mesh.getVertexPosition(i, v);
    box.expandByPoint(mesh.localToWorld(v));
  }
  return box;
}

function size(box: THREE.Box3): number {
  return box.getSize(new THREE.Vector3()).length();
}

describe("procedural figure skeleton", () => {
  it("binds every contract bone", () => {
    const { skeleton } = makeFigure();
    expect(skeleton.isValid).toBe(true);
    for (const bone of ALL_BONES) {
      expect(skeleton.getBone(bone), `${bone} not bound`).toBeDefined();
    }
  });

  it("parents every bone to its contract parent", () => {
    const { root } = makeFigure();
    for (const bone of ALL_BONES) {
      const node = root.getObjectByName(bone);
      expect(node, `${bone} missing from the hierarchy`).toBeDefined();
      const expected = FULL_PARENTS[bone];
      const parentName = (node!.parent as THREE.Object3D | null)?.name ?? null;
      if (!expected) {
        // Hips is the skeleton root: its THREE parent is the model group, not
        // another bone.
        expect(parentName, `${bone} should hang off the model root`).toBe(root.name);
        continue;
      }
      expect(parentName, `${bone} parented to ${parentName}`).toBe(expected);
    }
  });

  it("stands on the floor at roughly human height", () => {
    const { root } = makeFigure();
    const box = renderedBounds(root);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(1.4);
    expect(height).toBeLessThan(2.0);
    expect(box.min.y).toBeGreaterThan(-0.1);
  });

  it("keeps the hands attached to the arms", () => {
    const { root } = makeFigure();
    const hand = root.getObjectByName("LeftHand") as THREE.Bone;
    expect(hand.parent?.name).toBe("LeftForeArm");
    expect(hand.position.length()).toBeGreaterThan(0.05);
  });

  it("spreads the finger chain out instead of bunching it at the wrist", () => {
    // A fixed offset per joint - rather than per finger and per segment -
    // put all forty finger bones within a centimetre of each other, and a posed
    // finger then threw its segments clear across the figure.
    const { root } = makeFigure();
    root.updateMatrixWorld(true);
    const joint = (name: string): THREE.Vector3 => {
      const node = root.getObjectByName(name) as THREE.Bone;
      expect(node, `${name} missing`).toBeDefined();
      return node.getWorldPosition(new THREE.Vector3());
    };
    const base = joint("LeftHandIndex1");
    const mid = joint("LeftHandIndex2");
    const tip = joint("LeftHandIndex4");
    // Consecutive finger joints must be a real finger-length apart.
    expect(base.distanceTo(mid)).toBeGreaterThan(0.015);
    expect(mid.distanceTo(tip)).toBeGreaterThan(0.02);
    // And the finger must reach outward from the wrist, not fold back into it.
    expect(tip.distanceTo(joint("LeftHand"))).toBeGreaterThan(0.03);
  });
});

describe("procedural figure under a pose", () => {
  it("rotating one joint does not scatter the mesh", () => {
    const { root, skeleton } = makeFigure();
    const before = size(renderedBounds(root));

    skeleton.applyPose({ LeftForeArm: [0, 0, Math.PI / 2, Math.SQRT1_2] });
    const after = size(renderedBounds(root));

    expect(after).not.toBe(before);
    expect(after).toBeLessThan(before * 1.6);
  });

  it("survives real vendor poses, measured through the skinning path", () => {
    // Real reference poses, not a synthetic worst case: rotating every bone
    // by an independent 0.6 rad is more contorted than anything an artist
    // authored, so a bound on it only measures the bound.
    const here = dirname(fileURLToPath(import.meta.url));
    const repo = join(here, "..", "..", "..");
    const index = JSON.parse(
      readFileSync(
        join(repo, "public", "vendor", "pose-my-art", "extracted_poses", "index.json"),
        "utf8",
      ),
    ) as { poses: { name: string; data: string }[] };

    const { root, skeleton } = makeFigure();
    const bind = size(renderedBounds(root));
    expect(bind).toBeGreaterThan(1.4);
    expect(bind).toBeLessThan(2.2);

    // Measured across the first 60 reference poses the figure spans 1.58 m to
    // 2.26 m - a human standing through to a ballet jump. The bound sits above
    // that range so a genuine scatter fails and a legitimate contortion does
    // not.
    for (const row of index.poses.slice(0, 60)) {
      const file = join(repo, "public", "vendor", "pose-my-art", row.data);
      const pose = vendorBonesToPoseData(JSON.parse(readFileSync(file, "utf8")));
      skeleton.applyPose(pose);
      expect(size(renderedBounds(root)), `${row.name} scattered the figure`)
        .toBeLessThan(2.6);
    }
  });
});
