import { describe, expect, it } from "vitest";
import {
  collectTags,
  filterPoses,
  findPose,
  poseFromJson,
  poseToJson,
  validatePose,
  type Pose,
} from "../Pose";
import { POSE_LIBRARY } from "../PoseLibrary";
import {
  anglesToPose,
  isValidPose,
  mergePoses,
  mirrorPose,
  withBone,
} from "../PoseAuthoring";

// The 22 bones a standard humanoid rig exposes. Poses must reference only
// these, otherwise they cannot transfer to any shipped model.
const CONTRACT_BONES = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "LeftShoulder",
  "RightShoulder",
  "LeftArm",
  "RightArm",
  "LeftForeArm",
  "RightForeArm",
  "LeftHand",
  "RightHand",
  "LeftUpLeg",
  "RightUpLeg",
  "LeftLeg",
  "RightLeg",
  "LeftFoot",
  "RightFoot",
  "LeftToeBase",
  "RightToeBase",
];

describe("pose authoring", () => {
  it("converts degrees to a unit quaternion", () => {
    const q = anglesToPose({ Spine: [0, 90, 0] }).Spine;
    expect(q).toHaveLength(4);
    expect(Math.hypot(...q)).toBeCloseTo(1, 6);
  });

  it("produces an identity quaternion for zero angles", () => {
    const pose = anglesToPose({ Head: [0, 0, 0] });
    expect(pose.Head[0]).toBeCloseTo(0, 6);
    expect(pose.Head[3]).toBeCloseTo(1, 6);
  });

  it("mirrors a pose left to right", () => {
    const mirrored = mirrorPose(anglesToPose({ LeftArm: [0, 0, 40] }));
    expect(mirrored.LeftArm).toBeUndefined();
    expect(mirrored.RightArm).toBeDefined();
  });

  it("mirroring twice returns to the original", () => {
    const original = anglesToPose({
      LeftArm: [10, 20, 30],
      Spine: [0, 15, 0],
    });
    const round = mirrorPose(mirrorPose(original));
    for (const [bone, q] of Object.entries(original)) {
      const r = round[bone];
      expect(r[0]).toBeCloseTo(q[0], 5);
      expect(r[1]).toBeCloseTo(q[1], 5);
      expect(r[2]).toBeCloseTo(q[2], 5);
      expect(r[3]).toBeCloseTo(q[3], 5);
    }
  });

  it("merging poses lets later records win", () => {
    const a = anglesToPose({ Spine: [10, 0, 0] });
    const b = anglesToPose({ Spine: [50, 0, 0] });
    expect(mergePoses(a, b).Spine).toEqual(b.Spine);
  });

  it("withBone adds one bone without touching the rest", () => {
    const base = anglesToPose({ Spine: [10, 0, 0] });
    const next = withBone(base, "Head", 20);
    expect(next.Spine).toEqual(base.Spine);
    expect(next.Head).toBeDefined();
  });

  it("rejects non-finite pose data", () => {
    expect(isValidPose({ Spine: [0, 0, 0, 1] })).toBe(true);
    expect(isValidPose({ Spine: [0, 0, NaN, 1] })).toBe(false);
  });
});

describe("pose library", () => {
  it("ships about 100 poses", () => {
    expect(POSE_LIBRARY.length).toBeGreaterThanOrEqual(90);
  });

  it("has unique ids", () => {
    const ids = POSE_LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every pose a human-readable name", () => {
    for (const pose of POSE_LIBRARY) {
      expect(pose.name.length).toBeGreaterThan(0);
      expect(pose.name).not.toBe(pose.id);
    }
  });

  it("tags every pose with at least one category", () => {
    for (const pose of POSE_LIBRARY) {
      expect(pose.tags.length).toBeGreaterThan(0);
    }
  });

  it("covers every declared pose category", () => {
    const tags = collectTags(POSE_LIBRARY);
    for (const required of [
      "standing",
      "sitting",
      "walking",
      "running",
      "fighting",
      "aiming",
      "kneeling",
      "lying",
      "dancing",
      "gesture",
    ]) {
      expect(tags, `missing ${required}`).toContain(required);
    }
  });

  it("references only contract bone names", () => {
    const known = new Set(CONTRACT_BONES);
    for (const pose of POSE_LIBRARY) {
      const unknown = Object.keys(pose.bones).filter((b) => !known.has(b));
      expect(unknown, `${pose.id}: ${unknown.join(",")}`).toEqual([]);
    }
  });

  it("stores finite unit quaternions", () => {
    for (const pose of POSE_LIBRARY) {
      for (const [bone, q] of Object.entries(pose.bones)) {
        expect(q.every(Number.isFinite), `${pose.id}.${bone}`).toBe(true);
        expect(Math.hypot(...q), `${pose.id}.${bone}`).toBeCloseTo(1, 5);
      }
    }
  });

  it("includes a bind-pose entry", () => {
    const attention = findPose(POSE_LIBRARY, "attention");
    expect(attention).toBeDefined();
    expect(Object.keys(attention!.bones)).toHaveLength(0);
  });

  it("every pose validates against a full contract rig", () => {
    const known = new Set(CONTRACT_BONES);
    for (const pose of POSE_LIBRARY) {
      expect(validatePose(pose, known).ok, pose.id).toBe(true);
    }
  });

  it("poses are genuinely distinct from one another", () => {
    // Guards against a copy-paste mistake yielding 98 identical poses.
    const signatures = POSE_LIBRARY.map((p) =>
      JSON.stringify(Object.entries(p.bones).sort()),
    );
    expect(new Set(signatures).size).toBeGreaterThan(POSE_LIBRARY.length - 2);
  });
});

describe("filtering and search", () => {
  it("returns everything when no filter is given", () => {
    expect(filterPoses(POSE_LIBRARY)).toHaveLength(POSE_LIBRARY.length);
  });

  it("filters by tag", () => {
    const fighting = filterPoses(POSE_LIBRARY, { tags: ["fighting"] });
    expect(fighting.length).toBeGreaterThan(0);
    expect(fighting.length).toBeLessThan(POSE_LIBRARY.length);
    for (const pose of fighting) expect(pose.tags).toContain("fighting");
  });

  it("treats multiple tags as any-match", () => {
    const both = filterPoses(POSE_LIBRARY, { tags: ["fighting", "lying"] });
    const either = POSE_LIBRARY.filter(
      (p) => p.tags.includes("fighting") || p.tags.includes("lying"),
    );
    expect(both).toHaveLength(either.length);
  });

  it("searches by name, case-insensitively", () => {
    const results = filterPoses(POSE_LIBRARY, { search: "WAVE" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => /wave/i.test(p.name))).toBe(true);
  });

  it("searches by tag too", () => {
    expect(filterPoses(POSE_LIBRARY, { search: "kneel" }).length).toBeGreaterThan(
      0,
    );
  });

  it("combines search and tag filters", () => {
    const results = filterPoses(POSE_LIBRARY, {
      search: "sword",
      tags: ["fighting"],
    });
    expect(results.length).toBeGreaterThan(0);
    for (const pose of results) {
      expect(pose.tags).toContain("fighting");
      expect(/sword/i.test(pose.name)).toBe(true);
    }
  });

  it("returns nothing for a nonsense query", () => {
    expect(filterPoses(POSE_LIBRARY, { search: "zzzznotapose" })).toEqual([]);
  });
});

describe("serialisation", () => {
  const sample: Pose = {
    id: "test",
    name: "Test Pose",
    tags: ["standing"],
    bones: { Spine: [0, 0, 0, 1], Head: [0.1, 0.2, 0.3, 0.9] },
    source: "authored",
  };

  it("round-trips through JSON", () => {
    expect(poseFromJson(poseToJson(sample))).toEqual(sample);
  });

  it("returns null for malformed JSON", () => {
    expect(poseFromJson("{not json")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(poseFromJson(JSON.stringify({ name: "x" }))).toBeNull();
    expect(poseFromJson(JSON.stringify({ id: "x", name: "y" }))).toBeNull();
  });

  it("drops malformed bone entries rather than failing", () => {
    const restored = poseFromJson(
      JSON.stringify({
        id: "x",
        name: "x",
        tags: ["a"],
        bones: { Spine: [0, 0, 0, 1], Bad: [1, 2] },
      }),
    );
    expect(restored).not.toBeNull();
    expect(Object.keys(restored!.bones)).toEqual(["Spine"]);
  });

  it("round-trips every shipped pose", () => {
    for (const pose of POSE_LIBRARY) {
      expect(poseFromJson(poseToJson(pose)), pose.id).toEqual(pose);
    }
  });
});
