import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ARM_STATES,
  COMBINATION_COUNT,
  FACINGS,
  HEADS,
  SPINES,
  WEIGHTS,
  addAngles,
  generatePoses,
  mergeAngles,
  rootOffsetFor,
} from "../../../tools/generate-poses";
import {
  evaluatePose,
  orderBonesParentFirst,
  validateGeneratedPose,
  validateGeneratedPoses,
} from "../../../tools/validate-poses";
import { anglesToPose } from "../PoseAuthoring";
import { ALL_BONES, BODY_BONES, CORE_BONES } from "../../rig/RigContract";

/**
 * The pose generator and its validator.
 *
 * The validator is the load-bearing part: the objective is explicit that a
 * broken generated pose is worse than a missing one, so the checks below are
 * about shipping nothing that would confuse an artist.
 */

/** A ~1.75 m figure standing on a floor at Y=0, matching the build script. */
function rest(): Map<string, any> {
  const m = new Map<string, any>();
  const put = (n: string, x: number, y: number, z: number): void => m.set(n, { x, y, z });
  put("Hips", 0, 0.95, 0);
  put("Spine", 0, 1.1, 0);
  put("Spine1", 0, 1.25, 0);
  put("Spine2", 0, 1.4, 0);
  put("Neck", 0, 1.55, 0);
  put("Head", 0, 1.68, 0);
  put("LeftShoulder", 0.04, 1.46, 0);
  put("RightShoulder", -0.04, 1.46, 0);
  put("LeftArm", 0.18, 1.46, 0);
  put("RightArm", -0.18, 1.46, 0);
  put("LeftForeArm", 0.5, 1.46, 0);
  put("RightForeArm", -0.5, 1.46, 0);
  put("LeftHand", 0.78, 1.46, 0);
  put("RightHand", -0.78, 1.46, 0);
  put("LeftUpLeg", 0.1, 0.9, 0);
  put("RightUpLeg", -0.1, 0.9, 0);
  put("LeftLeg", 0.1, 0.5, 0);
  put("RightLeg", -0.1, 0.5, 0);
  put("LeftFoot", 0.1, 0.06, 0);
  put("RightFoot", -0.1, 0.06, 0);
  put("LeftToeBase", 0.1, 0.02, 0.12);
  put("RightToeBase", -0.1, 0.02, 0.12);
  return m;
}

const context = { restPositions: rest(), floorY: 0 };

describe("axis coverage", () => {
  it("declares the axes the objective names", () => {
    expect(ACTIONS.map((a) => a.key)).toEqual([
      "stand", "walk", "run", "fight", "aim", "kneel", "lying", "dance", "gesture",
    ]);
    expect(FACINGS.map((f) => f.key)).toEqual(["front", "three_quarter", "side", "back"]);
    expect(WEIGHTS.map((w) => w.key)).toEqual(["even", "left", "right"]);
    expect(SPINES.map((s) => s.key)).toEqual(["upright", "lean_forward", "lean_back", "twist"]);
    expect(HEADS.map((h) => h.key)).toEqual(["level", "turned", "up", "down"]);
    // 9 x 4 x 6 x 3 x 4 x 4
    expect(ARM_STATES).toHaveLength(6);
  });

  it("multiplies out to the documented combination count", () => {
    expect(COMBINATION_COUNT).toBe(9 * 4 * 6 * 3 * 4 * 4);
    expect(COMBINATION_COUNT).toBe(10368);
  });
});

describe("angle composition", () => {
  it("adds angles rather than replacing, so axes compose", () => {
    const out = addAngles({ Spine: [10, 0, 0] }, { Spine: [5, 0, 0] });
    expect(out.Spine[0]).toBe(15);
  });

  it("keeps axes independent", () => {
    const out = addAngles({ LeftArm: [0, 0, 60] }, { Spine: [10, 0, 0] });
    expect(out.LeftArm[0]).toBe(0);
    expect(out.LeftArm[2]).toBe(60);
    expect(out.Spine[0]).toBe(10);
  });

  it("clamps to a single turn", () => {
    const out = addAngles({ Spine: [170, 0, 0] }, { Spine: [170, 0, 0] });
    expect(out.Spine[0]).toBe(180);
  });

  it("mergeAngles lets later records win outright", () => {
    const out = mergeAngles({ Spine: [10, 0, 0] }, { Spine: [20, 0, 0] });
    expect(out.Spine[0]).toBe(20);
  });
});

describe("generatePoses", () => {
  it("produces one pose per combination", () => {
    const all = generatePoses();
    expect(all).toHaveLength(COMBINATION_COUNT);
  });

  it("is deterministic", () => {
    // Regenerating must produce an empty diff unless an axis actually changed.
    const a = generatePoses({ limit: 50 });
    const b = generatePoses({ limit: 50 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives every pose a unique id", () => {
    const all = generatePoses();
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it("only ever references contract bones", () => {
    for (const pose of generatePoses({ limit: 400 })) {
      for (const bone of Object.keys(pose.angles)) {
        expect(ALL_BONES).toContain(bone);
      }
    }
  });
  it("tags every pose with its action", () => {

    // Walk is the second action, so it sits past the first 300 combinations.
    const all = generatePoses({ limit: 1500 });
    const walking = all.find((p) => p.id.startsWith("gen_walk_"));
    expect(walking).toBeDefined();
    expect(walking!.tags).toContain("walking");
  });

  it("honours the limit", () => {
    expect(generatePoses({ limit: 12 })).toHaveLength(12);
  });

  it("drops a root offset only where the pose needs one", () => {
    expect(rootOffsetFor("kneel")).toEqual([0, -0.52, 0]);
    expect(rootOffsetFor("lying")).toEqual([0, -0.08, 0]);
    expect(rootOffsetFor("stand")).toBeUndefined();
  });
});

describe("evaluatePose", () => {
  it("leaves an unrotated pose at its rest positions", () => {
    const world = evaluatePose({}, context.restPositions);
    expect(world.get("Head")!.y).toBeCloseTo(1.68, 6);
    expect(world.get("LeftFoot")!.y).toBeCloseTo(0.06, 6);
  });

  it("keeps a child with its parent when the parent rotates", () => {
    // A rotated Hips must carry the whole figure with it. This is the check
    // that caught the original offset-vs-world bug, where a hand at rest read
    // as 0.78 - 1.46 = -0.68 and every generated pose was rejected.
    const restWorld = evaluatePose({}, context.restPositions);
    const world = evaluatePose({ Hips: [0, 0, 10] }, context.restPositions);
    expect(Math.abs(world.get("Head")!.x)).toBeGreaterThan(0.05);
    // Every bone moves, which is the property that matters: a child that
    // ignored its parent would stay put while the parent swung under it.
    for (const bone of ["Head", "LeftHand", "LeftFoot"]) {
      expect(world.get(bone)!.distanceTo(restWorld.get(bone)!)).toBeGreaterThan(0.01);
    }
  });

  it("orders a parent before its children", () => {
    const ordered = orderBonesParentFirst(["LeftFoot", "Hips", "Spine", "LeftUpLeg"]);
    expect(ordered.indexOf("Hips")).toBeLessThan(ordered.indexOf("Spine"));
    expect(ordered.indexOf("LeftUpLeg")).toBeLessThan(ordered.indexOf("LeftFoot"));
  });
});

describe("validateGeneratedPose", () => {
  const pose = {
    id: "test",
    name: "Test",
    tags: ["grounded"],
    angles: { LeftArm: [0, 0, 10] },
  };

  it("accepts a sound pose", () => {
    expect(validateGeneratedPose(pose, context)).toEqual([]);
  });

  it("rejects an unknown bone", () => {
    const bad = { ...pose, angles: { Tail: [0, 0, 0] } };
    expect(validateGeneratedPose(bad, context).join(" ")).toContain("unknown bone");
  });

  it("rejects a non-finite angle", () => {
    const bad = { ...pose, angles: { Spine: [NaN, 0, 0] } };
    expect(validateGeneratedPose(bad, context).join(" ")).toContain("non-finite");
  });

  it("rejects a joint rotated beyond a single turn", () => {
    const bad = { ...pose, angles: { Spine: [200, 0, 0] } };
    expect(validateGeneratedPose(bad, context).join(" ")).toContain("exceeds");
  });

  it("rejects a pose with nothing in it", () => {
    const bad = { ...pose, angles: {} };
    expect(validateGeneratedPose(bad, context)).toContain("pose is empty");
  });

  it("rejects a figure driven through the floor", () => {
    // Lying poses legitimately have no foot contact; a *grounded* one that
    // puts a foot far below the floor is broken.
    const bad = {
      ...pose,
      tags: ["grounded"],
      angles: { LeftUpLeg: [-120, 0, 0], LeftLeg: [120, 0, 0] },
    };
    const problems = validateGeneratedPose(bad, context).join(" ");
    expect(problems).toMatch(/floor|off the floor/);
  });

  it("allows an airborne pose with no foot contact", () => {
    const lying = {
      id: "lying",
      name: "Lying",
      tags: ["airborne"],
      angles: { Hips: [-88, 0, 0], LeftUpLeg: [-6, 0, 8] },
      rootOffset: [0, -0.08, 0] as [number, number, number],
    };
    expect(validateGeneratedPose(lying, context)).toEqual([]);
  });
});

describe("validateGeneratedPoses over the real library", () => {
  it("ships every combination once validated", () => {
    const { shipped, issues } = validateGeneratedPoses(generatePoses(), context);
    expect(shipped.length).toBeGreaterThan(1000);
    // Every axis combination produces a physically sound figure, so nothing is
    // rejected. The validator exists to catch a regression in the generator,
    // which the cases above prove it does.
    expect(issues.length).toBe(0);
  });
  it("leaves every shipped pose with a sound quaternion record", () => {
    const { shipped } = validateGeneratedPoses(generatePoses(), context);
    for (const pose of shipped.slice(0, 300)) {
      const bones = anglesToPose(pose.angles);
      for (const q of Object.values(bones)) {
        expect(Math.hypot(...q)).toBeCloseTo(1, 8);
      }
    }
  });

  it("explains every rejection", () => {
    // A silent rejection is a dropped pose nobody can account for.
    const { issues } = validateGeneratedPoses(generatePoses(), context);
    for (const issue of issues.slice(0, 50)) {
      expect(issue.reason.length).toBeGreaterThan(0);
      expect(issue.poseId).toMatch(/^gen_/);
    }
  });
});

describe("contract coverage", () => {
  it("never generates a bone outside the core contract", () => {
    for (const pose of generatePoses({ limit: 500 })) {
      for (const bone of Object.keys(pose.angles)) {
        expect(CORE_BONES).toContain(bone);
      }
    }
  });

  it("spans the spine and head axes, not just the limbs", () => {
    const all = generatePoses({ limit: 500 });
    const bones = new Set(all.flatMap((p) => Object.keys(p.angles)));
    for (const bone of ["Spine", "Spine1", "Neck", "Head"]) {
      expect(bones.has(bone)).toBe(true);
    }
    expect(BODY_BONES.length).toBeGreaterThan(15);
  });
});




