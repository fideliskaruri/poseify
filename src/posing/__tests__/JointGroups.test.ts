import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  GROUPABLE_BONES,
  groupIdFromName,
  removeGroup,
  resolveGroupBones,
  resetGroupBones,
  selectableBones,
  upsertGroup,
  validateGroups,
} from "../JointGroups";

/**
 * Joint groups.
 *
 * Stored as bone names rather than indices so a group survives a model swap
 * and can be validated against whatever rig is actually loaded.
 */

const full = new Set([
  "Hips",
  "Spine",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
]);

const armGroup = { id: "arms", name: "Arms", bones: ["LeftArm", "RightArm"] };

describe("validateGroups", () => {
  it("keeps a well-formed group", () => {
    expect(validateGroups([armGroup])).toHaveLength(1);
  });

  it("drops a group with no name, since the picker has nothing to label", () => {
    expect(validateGroups([{ ...armGroup, name: "  " }])).toEqual([]);
  });

  it("drops a group with no bones, which would do nothing", () => {
    expect(validateGroups([{ ...armGroup, bones: [] }])).toEqual([]);
  });

  it("drops bones that are not in the groupable contract", () => {
    // Finger groups are hand-pose work and Phase 5 covers them; a group of 40
    // finger bones is not something an artist ticks off one at a time.
    const result = validateGroups([
      { ...armGroup, bones: ["LeftArm", "LeftHandIndex1"] },
    ]);
    expect(result[0].bones).toEqual(["LeftArm"]);
  });

  it("de-duplicates repeated bones", () => {
    const result = validateGroups([
      { ...armGroup, bones: ["LeftArm", "LeftArm", "RightArm"] },
    ]);
    expect(result[0].bones).toEqual(["LeftArm", "RightArm"]);
  });

  it("survives a corrupt payload", () => {
    expect(validateGroups(null)).toEqual([]);
    expect(validateGroups("nope")).toEqual([]);
    expect(validateGroups([null, 3, armGroup])).toHaveLength(1);
  });
});

describe("resolveGroupBones", () => {
  it("returns every bone on a full rig", () => {
    expect(resolveGroupBones(armGroup, full)).toEqual({
      bones: ["LeftArm", "RightArm"],
      missing: [],
    });
  });

  it("names the bones a model lacks, rather than silently skipping", () => {
    // A group that quietly drops half its bones looks like the group is broken.
    const partial = new Set(["LeftArm"]);
    const result = resolveGroupBones(armGroup, partial);
    expect(result.bones).toEqual(["LeftArm"]);
    expect(result.missing).toEqual(["RightArm"]);
  });
});

describe("resetGroupBones", () => {
  it("removes exactly the group bones from the pose", () => {
    const pose = {
      LeftArm: [0, 0, 0.3, 0.95],
      RightArm: [0, 0, 0.2, 0.98],
      Spine: [0, 0.1, 0, 0.99],
    };
    const { pose: next, missing } = resetGroupBones(armGroup, pose, full);
    expect(Object.keys(next)).toEqual(["Spine"]);
    expect(missing).toEqual([]);
  });

  it("leaves bones the model lacks reported, not removed", () => {
    const pose = { LeftArm: [0, 0, 0.3, 0.95], RightArm: [0, 0, 0.2, 0.98] };
    const { pose: next, missing } = resetGroupBones(
      armGroup,
      pose,
      new Set(["LeftArm"]),
    );
    // RightArm is untouched because it is not on this model to reset.
    expect(Object.keys(next)).toContain("RightArm");
    expect(missing).toEqual(["RightArm"]);
  });

  it("does not mutate the caller's pose", () => {
    const pose = { LeftArm: [0, 0, 0.3, 0.95] };
    resetGroupBones(armGroup, pose, full);
    expect(Object.keys(pose)).toEqual(["LeftArm"]);
  });
});

describe("groupIdFromName", () => {
  it("slugs a name into a stable id", () => {
    expect(groupIdFromName("Both Arms")).toBe("both-arms");
    expect(groupIdFromName("  Legs & Feet! ")).toBe("legs-feet");
  });

  it("falls back for a name with nothing usable", () => {
    expect(groupIdFromName("!!!")).toBe("group");
  });

  it("is idempotent, so saving twice updates rather than duplicates", () => {
    expect(groupIdFromName("Arms")).toBe(groupIdFromName("arms"));
  });
});

describe("upsertGroup", () => {
  it("adds a new group", () => {
    expect(upsertGroup([], armGroup)).toHaveLength(1);
  });

  it("replaces one with the same id", () => {
    const first = upsertGroup([], armGroup);
    const second = upsertGroup(first, { ...armGroup, bones: ["LeftArm"] });
    expect(second).toHaveLength(1);
    expect(second[0].bones).toEqual(["LeftArm"]);
  });

  it("keeps unrelated groups", () => {
    const list = upsertGroup([], { ...armGroup, id: "a" });
    const two = upsertGroup(list, { ...armGroup, id: "b" });
    expect(two.map((g) => g.id).sort()).toEqual(["a", "b"]);
  });
});

describe("removeGroup", () => {
  it("removes only the named group", () => {
    const list = upsertGroup(
      upsertGroup([], { ...armGroup, id: "a" }),
      { ...armGroup, id: "b" },
    );
    expect(removeGroup(list, "a").map((g) => g.id)).toEqual(["b"]);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeGroup([armGroup], "zzz")).toHaveLength(1);
  });
});

describe("selectableBones", () => {
  it("lists only bones the model actually has", () => {
    expect(selectableBones(full)).toEqual(
      GROUPABLE_BONES.filter((b) => full.has(b)),
    );
  });

  it("returns nothing for a model with no contract bones", () => {
    expect(selectableBones(new Set())).toEqual([]);
  });
});
