import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BODY_BONES, CORE_BONES } from "../RigContract";
import { retargetSkeleton } from "../Retargeter";
import { buildSkeletonFixture } from "./fixtures";

describe("retargetSkeleton — tier 1 (exact names)", () => {
  it("maps every body bone by exact name on a clean rig", () => {
    const { root } = buildSkeletonFixture();
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.matches.size).toBe(CORE_BONES.length);
    for (const match of result.matches.values()) {
      expect(match.strategy).toBe("exact");
    }
  });

  it("each contract bone maps to the bone with that exact name", () => {
    const { root, bones } = buildSkeletonFixture();
    const result = retargetSkeleton(root);
    for (const [contractName, match] of result.matches) {
      expect(match.bone).toBe(bones.get(contractName));
    }
  });
});

describe("retargetSkeleton — tier 2 (aliases)", () => {
  it("resolves mixamorig-prefixed names", () => {
    const rename = Object.fromEntries(
      BODY_BONES.map((b) => [b, `mixamorig:${b}`]),
    );
    const { root } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.matches.get("Hips")!.strategy).toBe("alias");
  });

  it("resolves common synonym names", () => {
    const rename: Record<string, string> = {
      Hips: "pelvis",
      Spine2: "chest",
      LeftUpLeg: "left_thigh",
      RightLeg: "right_calf",
      LeftToeBase: "left_toe",
      RightShoulder: "clavicle_r",
      LeftForeArm: "l_forearm",
      RightHand: "r_hand",
    };
    const { root } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.matches.get("Hips")!.strategy).toBe("alias");
    expect(result.matches.get("RightLeg")!.strategy).toBe("alias");
  });
});

describe("retargetSkeleton — tier 3 (heuristic)", () => {
  it("resolves opaque bone names by hierarchy and length", () => {
    // Opaque names defeat tiers 1 and 2 entirely; only geometry remains.
    const rename = Object.fromEntries(BODY_BONES.map((b, i) => [b, `b${i}`]));
    const { root } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.matches.get("Hips")!.strategy).toBe("heuristic");
  });

  it("uses the T-pose side convention to split Left from Right", () => {
    const rename = Object.fromEntries(BODY_BONES.map((b, i) => [b, `b${i}`]));
    const { root, bones } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root);

    // Left limbs sit at positive X in the fixture's T-pose.
    expect(result.matches.get("LeftArm")!.bone).toBe(bones.get("LeftArm"));
    expect(result.matches.get("RightArm")!.bone).toBe(bones.get("RightArm"));
    expect(result.matches.get("LeftUpLeg")!.bone).toBe(
      bones.get("LeftUpLeg"),
    );
    expect(result.matches.get("RightUpLeg")!.bone).toBe(
      bones.get("RightUpLeg"),
    );
  });

  it("respects leftIsPositiveX = false by swapping the sides", () => {
    const rename = Object.fromEntries(BODY_BONES.map((b, i) => [b, `b${i}`]));
    const { root, bones } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root, { leftIsPositiveX: false });

    expect(result.matches.get("LeftArm")!.bone).toBe(bones.get("RightArm"));
    expect(result.matches.get("RightArm")!.bone).toBe(bones.get("LeftArm"));
  });
});

describe("retargetSkeleton — failure reporting", () => {
  it("reports missing bones on an incomplete rig", () => {
    const { root } = buildSkeletonFixture({
      omit: ["Neck", "Head"],
      detach: ["LeftForeArm", "RightForeArm"],
    });
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Neck");
    expect(result.missing).toContain("Head");
    expect(result.errors.join(" ")).toContain("does not match");
  });

  it("throws loudly when throwOnFailure is set", () => {
    const { root } = buildSkeletonFixture({ omit: ["Neck"] });
    expect(() => retargetSkeleton(root, { throwOnFailure: true })).toThrow(
      /retargetSkeleton failed/,
    );
  });

  it("throws on a mesh with no bones at all", () => {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial(),
      ),
    );

    const result = retargetSkeleton(group);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(CORE_BONES.length);
    expect(result.errors.join(" ")).toContain("No THREE.Bone");
    expect(() =>
      retargetSkeleton(group, { throwOnFailure: true }),
    ).toThrow(/No THREE.Bone/);
  });

  it("a scrambled skeleton does not silently pass", () => {
    const rename = Object.fromEntries(
      BODY_BONES.map((b) => [b, `xx_${b}_yy`]),
    );
    const { root } = buildSkeletonFixture({
      rename,
      omit: ["Head", "Neck", "Spine1"],
    });
    const result = retargetSkeleton(root);
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

describe("retargetSkeleton — mixed tiers in one rig", () => {
  it("keeps exact matches and back-fills the rest", () => {
    const rename: Record<string, string> = {
      Hips: "pelvis",
      Neck: "Neck",
      Head: "skull",
      LeftUpLeg: "L_thigh",
      RightUpLeg: "R_thigh",
    };
    const { root } = buildSkeletonFixture({ rename });
    const result = retargetSkeleton(root);

    expect(result.ok).toBe(true);
    expect(result.matches.get("Hips")!.strategy).toBe("alias");
    expect(result.matches.get("Neck")!.strategy).toBe("exact");
    expect(result.matches.get("Head")!.strategy).toBe("alias");
  });
});
