import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ALL_BONES,
  BODY_BONES,
  CORE_BONES,
  FULL_PARENTS,
  HAND_BONES,
  HAND_PARENTS,
  HIP_BONE,
  isHandBone,
  RIG_PARENTS,
  validateSkeleton,
} from "../RigContract";
import { buildSkeletonFixture, fixtureBoneNames } from "./fixtures";

describe("rig contract shape", () => {
  it("declares exactly 20 body bones", () => {
    expect(BODY_BONES).toHaveLength(20);
  });

  it("declares exactly 42 hand bones", () => {
    expect(HAND_BONES).toHaveLength(42);
  });

  it("union is 62 bones with no duplicates", () => {
    expect(ALL_BONES).toHaveLength(62);
    expect(new Set(ALL_BONES).size).toBe(62);
  });

  it("uses Hips as the hip bone", () => {
    expect(HIP_BONE).toBe("Hips");
    expect(BODY_BONES).toContain(HIP_BONE);
  });

  it("CORE_BONES is the 20 body bones plus both wrists", () => {
    expect(CORE_BONES).toHaveLength(22);
    expect(CORE_BONES).toContain("LeftHand");
    expect(CORE_BONES).toContain("RightHand");
    for (const b of BODY_BONES) expect(CORE_BONES).toContain(b);
  });

  it("every hand bone carries a Left or Right prefix", () => {
    for (const b of HAND_BONES) {
      expect(b.startsWith("Left") || b.startsWith("Right")).toBe(true);
    }
  });

  it("classifies hand bones correctly", () => {
    expect(isHandBone("LeftHand")).toBe(true);
    expect(isHandBone("RightHandPinky4")).toBe(true);
    expect(isHandBone("LeftForeArm")).toBe(false);
    expect(isHandBone("Hips")).toBe(false);
  });
});

describe("validateSkeleton — M1 acceptance", () => {
  it("a known Mixamo-named skeleton validates clean", () => {
    const { root } = buildSkeletonFixture();
    const names = fixtureBoneNames(root);

    expect(names).toContain("Hips");
    expect(names).toContain("LeftForeArm");
    expect(names).toContain("RightToeBase");

    const result = validateSkeleton(names);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    // The fixture carries exactly the core bones and no extras.
    expect(result.extra).toHaveLength(0);
  });

  it("a scrambled skeleton fails with a non-empty missing list", () => {
    // Rename so none of the contract names survive intact.
    const scrambled = Object.fromEntries(
      BODY_BONES.map((b) => [b, `bone_${b}`]),
    );
    const { root } = buildSkeletonFixture({ rename: scrambled });

    const result = validateSkeleton(fixtureBoneNames(root));
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing).toContain("Hips");
    expect(result.missing).toContain("LeftForeArm");
  });

  it("a skeleton missing one bone reports exactly that bone", () => {
    const { root } = buildSkeletonFixture({ omit: ["Neck"] });
    const result = validateSkeleton(fixtureBoneNames(root));
    expect(result.ok).toBe(false);
    // Head hangs off Neck, so dropping Neck orphans Head too.
    expect(result.missing).toEqual(["Neck", "Head"]);
  });

  it("extra bones are reported but do not fail validation", () => {
    const { root, bones } = buildSkeletonFixture();
    const helper = new THREE.Bone();
    helper.name = "Spine2_twist";
    bones.get("Spine2")!.add(helper);

    const result = validateSkeleton(fixtureBoneNames(root));
    expect(result.ok).toBe(true);
    expect(result.extra).toContain("Spine2_twist");
  });

  it("requireHands demands the full 62-bone rig", () => {
    const { root } = buildSkeletonFixture();
    const result = validateSkeleton(fixtureBoneNames(root), {
      requireHands: true,
    });
    expect(result.ok).toBe(false);
    // The body fixture has the two wrist bones but none of the 40 finger
    // bones, so 40 of the 62 required names are absent.
    expect(result.missing).toHaveLength(40);
  });

  describe("finger hierarchy", () => {
    it("chains every finger from the wrist outwards", () => {
      for (const side of ["Left", "Right"]) {
        for (const finger of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
          expect(HAND_PARENTS[`${side}Hand${finger}1`]).toBe(`${side}Hand`);
          expect(HAND_PARENTS[`${side}Hand${finger}2`]).toBe(
            `${side}Hand${finger}1`,
          );
          expect(HAND_PARENTS[`${side}Hand${finger}3`]).toBe(
            `${side}Hand${finger}2`,
          );
          expect(HAND_PARENTS[`${side}Hand${finger}4`]).toBe(
            `${side}Hand${finger}3`,
          );
        }
      }
    });

    it("covers all 40 finger bones and no wrists", () => {
      expect(Object.keys(HAND_PARENTS)).toHaveLength(40);
      expect(Object.keys(HAND_PARENTS)).not.toContain("LeftHand");
      expect(Object.keys(HAND_PARENTS)).not.toContain("RightHand");
    });

    it("leaves the documented 22-bone body map untouched", () => {
      // RIG_PARENTS is quoted in FINDINGS.md, so adding finger entries there
      // would silently change the documented contract. They live in
      // HAND_PARENTS and are merged only via FULL_PARENTS.
      // 20 body bones plus the two wrists, which the map also has to carry so
      // the hand chains have somewhere to hang.
      expect(Object.keys(RIG_PARENTS)).toHaveLength(CORE_BONES.length);
      expect(Object.keys(FULL_PARENTS)).toHaveLength(
        CORE_BONES.length + 40,
      );
    });

    it("resolves every contract bone through FULL_PARENTS except the root", () => {
      for (const bone of ALL_BONES) {
        if (bone === HIP_BONE) {
          expect(FULL_PARENTS[bone]).toBeNull();
          continue;
        }
        expect(FULL_PARENTS[bone]).toBeDefined();
      }
    });
  });
});
