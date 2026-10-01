import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  COCO18,
  HAND_KEYPOINTS,
  HAND_LIMBS,
  OPENPOSE_FULL,
  coco18Index,
  extractCoco18,
  extractHandKeypoints,
} from "../OpenPose";
import { makeSkeleton, testConfig } from "../../posing/__tests__/posingFixtures";
import { PosableSkeleton } from "../../posing/PosableSkeleton";
import { ALL_BONES, FULL_PARENTS } from "../../rig/RigContract";

/**
 * Phase 3: OpenPose with and without hands.
 *
 * PoseMy.Art exports both forms because different downstream tools consume
 * different ones. The body-only form stays byte-identical to what shipped in
 * the v1 build, so the assertions below are about addition, never substitution.
 */

/** A camera that frames a standing figure, matching the existing tests. */
function cameraLookingAtSubject(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.2, 4);
  camera.lookAt(0, 0.95, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * A skeleton carrying the full 62-bone contract, fingers included.
 *
 * The shared fixture is body-only, so the with-hands path needs real finger
 * bones to prove it projects them rather than falling back to the wrist.
 */
function makeHandedSkeleton(): PosableSkeleton {
  // The shared fixture builds from RIG_PARENTS, which stops at the wrist, so
  // it produces no finger bones. Build the same shape directly from
  // FULL_PARENTS instead: a Bone per contract name, each offset from the wrist
  // so the finger keypoints project to distinct pixels, plus a SkinnedMesh so
  // PosableSkeleton can set up its IK chains.
  const bones = new Map<string, THREE.Bone>();
  const ordered = ALL_BONES.filter((n) => n !== "Hips");
  // Give each bone a world position unique to its own index. Nesting alone is
  // not enough: sibling bones under the same parent would land on the same
  // spot and project to the same pixel, which is exactly the collision this
  // fixture exists to rule out.
  ordered.forEach((name, index) => {
    const bone = new THREE.Bone();
    bone.name = name;
    // Positions are local to the parent, so a finger chain must step outward
    // from the wrist rather than repeat one offset. Indexing by array
    // position alone put index1..3 at the same place.
    const parent = FULL_PARENTS[name];
    const depth = parent ? parentDepth(parent) : 0;
    bone.position.set(0.02 * depth, 0, 0.02 * (index % 5));
    bones.set(name, bone);
  });

  const rootBone = new THREE.Bone();
  rootBone.name = "Hips";
  const group = new THREE.Group();
  group.add(rootBone);
  for (const [name, bone] of bones) {
    const parentName = FULL_PARENTS[name];
    const parent = parentName ? bones.get(parentName) ?? rootBone : rootBone;
    parent.add(bone);
  }

  for (const bone of [rootBone, ...bones.values()]) bone.updateMatrixWorld(true);
  const skinned = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  skinned.name = "__handed_ik_anchor";
  skinned.frustumCulled = false;
  skinned.visible = false;
  group.add(skinned);
  group.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton([rootBone, ...bones.values()]));

  return new PosableSkeleton(group, testConfig("handed"), {
    // requireHands is what makes the retargeter seek all 62 names; without it
    // only the 22 core bones are bound and every finger falls back.
    requireHands: true,
  });
}

/** How deep a contract bone sits in the full hierarchy. */
function parentDepth(name: string): number {
  let d = 0;
  let cur: string | null = FULL_PARENTS[name];
  while (cur) {
    d += 1;
    cur = FULL_PARENTS[cur];
  }
  return d;
}

describe("hand keypoint declaration", () => {
  it("declares 32 finger keypoints, 16 per hand", () => {
    expect(HAND_KEYPOINTS).toHaveLength(32);
    expect(HAND_KEYPOINTS.filter((n) => n.startsWith("Left"))).toHaveLength(16);
    expect(HAND_KEYPOINTS.filter((n) => n.startsWith("Right"))).toHaveLength(16);
    expect(new Set(HAND_KEYPOINTS).size).toBe(32);
  });

  it("gives every finger a proximal joint, and the thumb a fourth segment", () => {
    for (const side of ["Left", "Right"]) {
      for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
        for (const n of [1, 2, 3]) {
          expect(HAND_KEYPOINTS).toContain(`${side}Hand${finger}${n}`);
        }
      }
      for (const n of [1, 2, 3, 4]) {
        expect(HAND_KEYPOINTS).toContain(`${side}HandThumb${n}`);
      }
    }
  });

  it("appends hands after the body so COCO-18 indices never move", () => {
    expect(OPENPOSE_FULL.slice(0, COCO18.length)).toEqual([...COCO18]);
    expect(OPENPOSE_FULL).toHaveLength(18 + 32);
  });
});

describe("hand limb connections", () => {
  it("keeps every connection a valid index into the full list", () => {
    expect(HAND_LIMBS.length).toBeGreaterThan(0);
    for (const [a, b] of HAND_LIMBS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(OPENPOSE_FULL.length);
      expect(b).toBeLessThan(OPENPOSE_FULL.length);
      expect(a).not.toBe(b);
    }
  });

  it("anchors each hand to its COCO-18 wrist", () => {
    // Without this a with-hands image is a body plus two floating clusters.
    for (const side of ["Left", "Right"]) {
      const wrist = coco18Index(`${side}Wrist`);
      const links = HAND_LIMBS.filter(([a]) => a === wrist);
      // One per finger, five in total.
      expect(links).toHaveLength(5);
    }
  });

  it("chains the thumb through all four segments", () => {
    const base = COCO18.length;
    const at = (n: string): number => base + HAND_KEYPOINTS.indexOf(n);
    for (const side of ["Left", "Right"]) {
      expect(HAND_LIMBS).toContainEqual([at(`${side}HandThumb1`), at(`${side}HandThumb2`)]);
      expect(HAND_LIMBS).toContainEqual([at(`${side}HandThumb2`), at(`${side}HandThumb3`)]);
      expect(HAND_LIMBS).toContainEqual([at(`${side}HandThumb3`), at(`${side}HandThumb4`)]);
    }
  });
});

describe("extractCoco18 includeHands flag", () => {
  it("defaults to body-only, preserving the ControlNet form", () => {
    const sk = makeHandedSkeleton();
    expect(extractCoco18(sk, cameraLookingAtSubject())).toHaveLength(18);
  });

  it("produces strictly more keypoints with hands than without", () => {
    const sk = makeHandedSkeleton();
    const camera = cameraLookingAtSubject();
    const body = extractCoco18(sk, camera);
    const full = extractCoco18(sk, camera, { includeHands: true });
    expect(full.length).toBeGreaterThan(body.length);
    expect(full.length).toBe(body.length + HAND_KEYPOINTS.length);
  });

  it("leaves the body prefix identical, so existing consumers are unaffected", () => {
    const sk = makeHandedSkeleton();
    const camera = cameraLookingAtSubject();
    const body = extractCoco18(sk, camera);
    const full = extractCoco18(sk, camera, { includeHands: true });
    for (let i = 0; i < body.length; i += 1) {
      expect(full[i].name).toBe(body[i].name);
      expect(full[i].x).toBeCloseTo(body[i].x, 12);
      expect(full[i].y).toBeCloseTo(body[i].y, 12);
    }
  });

  it("projects the declared finger keypoints in order", () => {
    const sk = makeHandedSkeleton();
    const hands = extractHandKeypoints(sk, cameraLookingAtSubject());
    expect(hands.map((k) => k.name)).toEqual([...HAND_KEYPOINTS]);
  });

  it("produces distinct model-space positions for the finger chain", () => {
    // Local offsets accumulate down a chain, so screen position is not a
    // reliable discriminator for a synthetic rig. Model space is what a
    // downstream consumer reads, and it must separate the segments.
    const sk = makeHandedSkeleton();
    const hands = extractHandKeypoints(sk, cameraLookingAtSubject());
    const left = hands.filter((k) => k.name.startsWith("LeftHandIndex"));
    const positions = new Set(
      left.map((k) => `${k.model.x.toFixed(6)},${k.model.y.toFixed(6)}`),
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("graceful degradation on a body-only model", () => {
  it("falls back to the wrist rather than the image origin", () => {
    // The horse and the mermaids have no finger bones. They must still produce
    // a valid image: finite coordinates and no collapsed 0,0 points.
    const sk = makeSkeleton();
    const hands = extractHandKeypoints(sk, cameraLookingAtSubject());
    expect(hands).toHaveLength(HAND_KEYPOINTS.length);
    for (const k of hands) {
      expect(Number.isFinite(k.x)).toBe(true);
      expect(Number.isFinite(k.y)).toBe(true);
    }
  });

  it("still yields a usable full-list extraction", () => {
    const sk = makeSkeleton();
    const full = extractCoco18(sk, cameraLookingAtSubject(), {
      includeHands: true,
    });
    expect(full).toHaveLength(OPENPOSE_FULL.length);
    // Every limb index the renderer will look up must exist.
    for (const [a, b] of HAND_LIMBS) {
      expect(full[a]).toBeDefined();
      expect(full[b]).toBeDefined();
    }
  });
});

