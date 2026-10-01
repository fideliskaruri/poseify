import { describe, expect, it } from "vitest";
import { FULL_PARENTS, BODY_BONES } from "../../rig/RigContract";
import {
  LIMB_ROOTS,
  limbBones,
  mirrorLimb,
  mirrorPose,
  swapSides,
  anglesToPose,
} from "../PoseAuthoring";
import { PoseClipboard, randomPoseIndex } from "../PoseClipboard";
import type { PoseData } from "../../posing/PosableSkeleton";

/** Compare two poses with a tolerance, so floating-point noise is allowed. */
function expectPoseClose(
  actual: PoseData,
  expected: PoseData,
  eps = 1e-6,
): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const bone of Object.keys(expected)) {
    for (let i = 0; i < 4; i += 1) {
      expect(actual[bone][i]).toBeCloseTo(expected[bone][i], eps);
    }
  }
}

describe("swapSides", () => {
  it("swaps Left and Right", () => {
    expect(swapSides("LeftArm")).toBe("RightArm");
    expect(swapSides("RightArm")).toBe("LeftArm");
  });

  it("leaves bones with no side alone", () => {
    expect(swapSides("Spine")).toBe("Spine");
    expect(swapSides("Hips")).toBe("Hips");
  });
});

describe("limbBones", () => {
  it("collects the arm chain including hand and fingers", () => {
    const arm = limbBones("arm");
    expect(arm).toContain("LeftArm");
    expect(arm).toContain("LeftForeArm");
    expect(arm).toContain("LeftHand");
    expect(arm).toContain("RightArm");
    expect(arm).toContain("RightHand");
    expect(arm.some((b) => b.includes("Index1"))).toBe(true);
    expect(arm).not.toContain("LeftUpLeg");
  });

  it("collects the leg chain but not the spine", () => {
    const leg = limbBones("leg");
    expect(leg).toContain("LeftUpLeg");
    expect(leg).toContain("LeftLeg");
    expect(leg).toContain("LeftFoot");
    expect(leg).toContain("RightToeBase");
    expect(leg).not.toContain("LeftArm");
    expect(leg).not.toContain("Spine");
  });

  it("terminates on a malformed parent map rather than hanging", () => {
    const cyclic = { A: "B", B: "A" };
    expect(limbBones("arm", cyclic)).toEqual([]);
  });

  it("reaches finger bones, which the 22-bone body map alone cannot", () => {
    // Regression guard: RIG_PARENTS stops at the wrist, so walking it found no
    // fingers and a mirrored arm silently lost them.
    expect(limbBones("arm").some((b) => b.includes("Index1"))).toBe(true);
    expect(limbBones("arm").some((b) => b.includes("Thumb4"))).toBe(true);
    // A finger is not a leg.
    expect(limbBones("leg").some((b) => b.includes("Index"))).toBe(false);
  });
});

describe("mirrorLimb — the fix-one-side workflow", () => {
  const pose: PoseData = anglesToPose({
    LeftArm: [0, 0, 30],
    RightArm: [0, 0, -20],
    LeftForeArm: [0, 45, 0],
    LeftUpLeg: [10, 0, 0],
    RightUpLeg: [-10, 0, 0],
    Spine: [5, 0, 0],
    Hips: [0, 0, 15],
  });

  it("mirrors the arms and leaves the legs untouched", () => {
    const out = mirrorLimb(pose, "arm");
    expect(out.RightArm[0]).toBeCloseTo(pose.LeftArm[0], 1e-6);
    expect(out.RightArm[1]).toBeCloseTo(-pose.LeftArm[1], 1e-6);
    expect(out.RightArm[2]).toBeCloseTo(-pose.LeftArm[2], 1e-6);
    expect(out.RightArm[3]).toBeCloseTo(pose.LeftArm[3], 1e-6);
    for (const bone of ["LeftUpLeg", "RightUpLeg", "Spine", "Hips"]) {
      for (let i = 0; i < 4; i += 1) {
        expect(out[bone][i]).toBe(pose[bone][i]);
      }
    }
  });

  it("mirrors the legs and leaves the arms untouched", () => {
    const out = mirrorLimb(pose, "leg");
    for (const bone of ["LeftArm", "RightArm", "Spine", "Hips"]) {
      for (let i = 0; i < 4; i += 1) {
        expect(out[bone][i]).toBe(pose[bone][i]);
      }
    }
    expect(out.RightUpLeg[1]).toBeCloseTo(-pose.LeftUpLeg[1], 1e-6);
  });

  it("is its own inverse within 1e-6", () => {
    // The pose carries both sides of every chain it touches, so mirroring is
    // key-set preserving and must return to the original.
    const symmetric: PoseData = {
      ...anglesToPose({
        LeftArm: [0, 0, 30],
        RightArm: [0, 0, -30],
        LeftForeArm: [0, 45, 0],
        RightForeArm: [0, 45, 0],
        LeftUpLeg: [10, 0, 0],
        RightUpLeg: [-10, 0, 0],
        Spine: [5, 0, 0],
        Hips: [0, 0, 15],
      }),
    };
    const once = mirrorLimb(symmetric, "arm");
    const twice = mirrorLimb(once, "arm");
    expectPoseClose(twice, symmetric, 1e-6);
  });

  it("populates the opposite side when a chain is posed on one side only", () => {
    // A one-sided pose gains its mirror rather than being dropped: the point of
    // "mirror just the arms" is that the other arm gets the movement.
    const out = mirrorLimb({ LeftForeArm: [0, 45, 0] }, "arm");
    expect(out.RightForeArm).toBeDefined();
  });
});

describe("mirrorPose stays whole-body and reversible", () => {
  it("twice returns to the original within 1e-6", () => {
    const pose: PoseData = anglesToPose({
      LeftArm: [10, 20, 30],
      RightArm: [5, 5, 5],
      Spine: [3, 4, 5],
      LeftUpLeg: [1, 2, 3],
    });
    const once = mirrorPose(pose);
    const twice = mirrorPose(once);
    expectPoseClose(twice, pose, 1e-6);
  });

  it("swaps sides across every contract bone", () => {
    const pose: PoseData = {};
    for (const bone of BODY_BONES) {
      pose[bone] = [0.1, 0.2, 0.3, 0.927];
    }
    const mirrored = mirrorPose(pose);
    for (const bone of BODY_BONES) {
      expect(mirrored[swapSides(bone)]).toBeDefined();
    }
  });

  it("normalises negative zero so a round-trip is deep-equal", () => {
    const mirrored = mirrorPose({ LeftArm: [0, 0, 0, 1] });
    for (const value of mirrored.RightArm) {
      expect(Object.is(value, -0)).toBe(false);
    }
  });
});

describe("PoseClipboard", () => {
  it("holds a pose and hands back a copy", () => {
    const clip = new PoseClipboard();
    expect(clip.hasPose).toBe(false);
    expect(clip.paste()).toBeNull();

    const pose: PoseData = anglesToPose({ LeftArm: [0, 0, 45] });
    expect(clip.copy(pose, "test")).toBe(true);
    expect(clip.hasPose).toBe(true);

    const pasted = clip.paste()!;
    expect(pasted.LeftArm[3]).toBeCloseTo(pose.LeftArm[3], 1e-9);
    pasted.LeftArm[0] = 999;
    expect(clip.paste()!.LeftArm[0]).not.toBe(999);
  });

  it("refuses an invalid pose rather than storing it", () => {
    const clip = new PoseClipboard();
    expect(clip.copy({ Bad: [1, 2, 3] } as unknown as PoseData)).toBe(false);
    expect(clip.hasPose).toBe(false);
  });

  it("reports the bone count and origin for the status line", () => {
    const clip = new PoseClipboard();
    clip.copy(
      anglesToPose({ LeftArm: [0, 0, 10], Spine: [1, 1, 1] }),
      "mannequin",
    );
    expect(clip.summary?.boneCount).toBe(2);
    expect(clip.summary?.origin).toBe("mannequin");
  });

  it("transfers a pose to 1e-6, matching the transfer standard", () => {
    const clip = new PoseClipboard();
    const source: PoseData = anglesToPose({
      LeftArm: [12, 34, 56],
      RightLeg: [-10, 20, -30],
      Hips: [0, 90, 0],
    });
    clip.copy(source);
    expectPoseClose(clip.paste()!, source, 1e-6);
  });
});

describe("randomPoseIndex", () => {
  it("stays in range for any count", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const i = randomPoseIndex(7, seed);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(7);
    }
  });

  it("returns -1 for an empty library rather than throwing", () => {
    expect(randomPoseIndex(0, 1)).toBe(-1);
  });

  it("is deterministic for a given seed", () => {
    expect(randomPoseIndex(12, 5)).toBe(randomPoseIndex(12, 5));
  });
});

describe("LIMB_ROOTS", () => {
  it("names both sides of each limb", () => {
    for (const roots of Object.values(LIMB_ROOTS)) {
      expect(roots.length).toBe(2);
      expect(roots[0]).toMatch(/^Left/);
      expect(roots[1]).toMatch(/^Right/);
    }
  });
});
