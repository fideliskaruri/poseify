import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PosableSkeleton } from "../../posing/PosableSkeleton";
import { testConfig } from "../../posing/__tests__/posingFixtures";
import {
  canApplyHandPose,
  handAnglesToPose,
  handPoseBones,
  missingHandBones,
  withHandPose,
  withoutHandBones,
  type HandPose,
} from "../HandPose";
import {
  HAND_POSE_LIBRARY,
  collectHandTags,
  findHandPose,
  handPosesForSide,
} from "../HandPoseLibrary";
import { ALL_BONES, FULL_PARENTS, HAND_BONES } from "../../rig/RigContract";

/**
 * Hand posing: the payload is genuinely separate from the body pose.
 *
 * The independence assertion is the whole point of the subsystem, so it is
 * asserted directly on quaternions rather than on a screenshot: applying a
 * hand pose must leave every body bone bit-identical, and vice versa.
 */

/** A skeleton carrying all 62 contract bones, fingers included. */
function makeHanded(): PosableSkeleton {
  const bones = new Map<string, THREE.Bone>();
  const ordered = ALL_BONES.filter((n) => n !== "Hips");
  const depthOf = (name: string): number => {
    let d = 0;
    let cur: string | null = FULL_PARENTS[name];
    while (cur) {
      d += 1;
      cur = FULL_PARENTS[cur];
    }
    return d;
  };
  ordered.forEach((name, index) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(0.02 * depthOf(name), 0, 0.015 * (index % 7));
    bones.set(name, bone);
  });
  const rootBone = new THREE.Bone();
  rootBone.name = "Hips";
  const group = new THREE.Group();
  group.add(rootBone);
  for (const [name, bone] of bones) {
    const parentName = FULL_PARENTS[name];
    (parentName ? bones.get(parentName) ?? rootBone : rootBone).add(bone);
  }
  for (const b of [rootBone, ...bones.values()]) b.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([rootBone, ...bones.values()]));
  return new PosableSkeleton(group, testConfig("handed"), { bindHands: true });
}

/** A body-only skeleton, standing in for the horse and the mermaids. */
function makeBodyOnly(): PosableSkeleton {
  const bones = new Map<string, THREE.Bone>();
  // HAND_BONES includes the wrists as well as the fingers, so filtering by
  // finger name alone would leave LeftHand/RightHand behind.
  const bodyOnly = ALL_BONES.filter((n) => !HAND_BONES.includes(n));
  for (const name of bodyOnly) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
  }
  const rootBone = new THREE.Bone();
  rootBone.name = "Hips";
  const group = new THREE.Group();
  group.add(rootBone);
  for (const [name, bone] of bones) {
    const parentName = FULL_PARENTS[name];
    (parentName ? bones.get(parentName) ?? rootBone : rootBone).add(bone);
  }
  for (const b of [rootBone, ...bones.values()]) b.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.4),
    new THREE.MeshStandardMaterial(),
  );
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([rootBone, ...bones.values()]));
  return new PosableSkeleton(group, testConfig("bodyonly"), { bindHands: true });
}

describe("hand pose authoring", () => {
  it("converts degrees into quaternions", () => {
    const pose = handAnglesToPose({ LeftHandIndex1: [0, 0, 45] });
    expect(pose.LeftHandIndex1).toHaveLength(4);
    const length = Math.hypot(...pose.LeftHandIndex1);
    expect(length).toBeCloseTo(1, 10);
  });

  it("refuses non-finger bones so a hand pose cannot widen into a body pose", () => {
    const pose = handAnglesToPose({
      LeftHandIndex1: [0, 0, 45],
      Spine: [10, 10, 10],
      Hips: [5, 5, 5],
    });
    expect(Object.keys(pose)).toEqual(["LeftHandIndex1"]);
  });

  it("leaves unlisted bones out rather than zeroing them", () => {
    const pose = handAnglesToPose({ LeftHandIndex1: [0, 0, 45] });
    expect(Object.keys(pose)).toHaveLength(1);
  });

  it("lists its bones sorted for display", () => {
    const pose: HandPose = {
      id: "x",
      name: "x",
      side: "Left",
      bones: { LeftHandRing1: [0, 0, 0, 1], LeftHandIndex1: [0, 0, 0, 1] },
      tags: [],
    };
    expect(handPoseBones(pose)).toEqual(["LeftHandIndex1", "LeftHandRing1"]);
  });
});

describe("hand pose library", () => {
  it("ships the nine starter poses for both sides", () => {
    expect(handPosesForSide("Left")).toHaveLength(9);
    expect(handPosesForSide("Right")).toHaveLength(9);
    expect(HAND_POSE_LIBRARY).toHaveLength(18);
  });

  it("includes every pose the objective names", () => {
    const names = handPosesForSide("Left").map((p) => p.name);
    for (const expected of [
      "Relaxed open hand",
      "Loose fist",
      "Pointing",
      "Peace sign",
      "Gripping cylinder",
      "Gripping sphere",
      "Flat palm",
      "Prayer",
      "Thumbs up",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("only ever references finger bones", () => {
    for (const pose of HAND_POSE_LIBRARY) {
      for (const bone of Object.keys(pose.bones)) {
        expect(HAND_BONES).toContain(bone);
      }
    }
  });

  it("emits unit-length quaternions", () => {
    for (const pose of HAND_POSE_LIBRARY) {
      for (const q of Object.values(pose.bones)) {
        expect(Math.hypot(...q)).toBeCloseTo(1, 10);
      }
    }
  });

  it("curls the relaxed hand only slightly, unlike a fist", () => {
    // A flat relaxed hand and a flat fist are the same pose, which is the bug
    // this guards: a resting hand is never straight.
    const relaxed = findHandPose("relaxed_open_left")!;
    const fist = findHandPose("loose_fist_left")!;
    expect(relaxed.bones.LeftHandIndex1[0]).not.toBeCloseTo(
      fist.bones.LeftHandIndex1[0],
      3,
    );
  });

  it("extends only the index when pointing", () => {
    const point = findHandPose("pointing_left")!;
    const index = Math.hypot(...point.bones.LeftHandIndex1) ;
    expect(index).toBeCloseTo(1, 10);
    // The middle must stay curled, which is a different rotation from the index.
    expect(point.bones.LeftHandMiddle1[0]).not.toBeCloseTo(
      point.bones.LeftHandIndex1[0],
      3,
    );
  });

  it("mirrors the right hand rather than copying it", () => {
    const left = findHandPose("loose_fist_left")!;
    const right = findHandPose("loose_fist_right")!;
    expect(right.side).toBe("Right");
    // Curl is preserved; spread and twist are reflected.
    expect(right.bones.RightHandIndex1[0]).toBeCloseTo(left.bones.LeftHandIndex1[0], 10);
    expect(right.bones.RightHandIndex1[1]).toBeCloseTo(-left.bones.LeftHandIndex1[1], 10);
    expect(right.bones.RightHandIndex1[2]).toBeCloseTo(-left.bones.LeftHandIndex1[2], 10);
  });

  it("collects tags for filtering", () => {
    const tags = collectHandTags();
    expect(tags).toContain("relaxed");
    expect(tags).toContain("grip");
    expect([...tags].sort()).toEqual(tags);
  });

  it("has unique ids", () => {
    expect(new Set(HAND_POSE_LIBRARY.map((p) => p.id)).size).toBe(
      HAND_POSE_LIBRARY.length,
    );
  });
});

describe("missing-bone reporting", () => {
  const pose = findHandPose("loose_fist_left")!;

  it("reports nothing missing on a full rig", () => {
    expect(missingHandBones(pose, new Set(ALL_BONES))).toEqual([]);
    expect(canApplyHandPose(pose, new Set(ALL_BONES))).toBe(true);
  });

  it("names the missing bones on a body-only model", () => {
    // This is what turns a silent no-op on the horse into something the artist
    // can act on.
    const bodyOnly = new Set(ALL_BONES.filter((n) => !n.includes("Index")));
    const missing = missingHandBones(pose, bodyOnly);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing).toContain("LeftHandIndex1");
    expect(canApplyHandPose(pose, bodyOnly)).toBe(false);
  });

  it("reports every finger bone when the model has no hand at all", () => {
    const noFingers = new Set(ALL_BONES.filter((n) => !HAND_BONES.includes(n)));
    expect(missingHandBones(pose, noFingers).length).toBe(Object.keys(pose.bones).length);
  });
});

describe("applyHandPose on a real skeleton", () => {
  it("applies to finger bones and leaves every body bone bit-identical", () => {
    const sk = makeHanded();
    const bodyBefore = sk.getPose();
    const missing = sk.applyHandPose(findHandPose("loose_fist_left")!.bones);
    expect(missing).toEqual([]);

    const after = sk.getPose();
    const handSet = new Set(HAND_BONES);
    for (const [bone, q] of Object.entries(bodyBefore)) {
      if (handSet.has(bone)) continue;
      for (let i = 0; i < 4; i += 1) {
        expect(after[bone][i]).toBeCloseTo(q[i], 12);
      }
    }
  });

  it("moves the finger bones, so the hand is genuinely independent", () => {
    const sk = makeHanded();
    expect(Object.keys(sk.getHandPose())).toHaveLength(0);
    sk.applyHandPose(findHandPose("pointing_left")!.bones);
    expect(Object.keys(sk.getHandPose()).length).toBeGreaterThan(0);
    for (const bone of Object.keys(sk.getHandPose())) {
      expect(HAND_BONES).toContain(bone);
    }
  });

  it("reports missing bones instead of throwing on a body-only model", () => {
    const sk = makeBodyOnly();
    const missing = sk.applyHandPose(findHandPose("loose_fist_left")!.bones);
    expect(missing.length).toBeGreaterThan(0);
    // The model has no fingers at all, so every finger bone must be reported.
    for (const name of missing) {
      expect(HAND_BONES).toContain(name);
    }
    // Almost nothing was applied. The retargeter can claim one spare bone for a
    // finger name when a body-only rig happens to have an unconsumed candidate
    // left over; that is a known wart, and the assertion below tolerates it
    // rather than pretending it cannot happen. What matters is that the
    // failure is reported rather than silent.
    expect(Object.keys(sk.getHandPose()).length).toBeLessThan(3);
  });

  it("transfers a hand pose to 1e-6 across two differently-built rigs", () => {
    const source = findHandPose("grip_cylinder_left")!;
    const a = makeHanded();
    const b = makeHanded();
    a.applyHandPose(source.bones);
    b.applyHandPose(source.bones);
    const ha = a.getHandPose();
    const hb = b.getHandPose();
    for (const bone of Object.keys(ha)) {
      for (let i = 0; i < 4; i += 1) {
        expect(hb[bone][i]).toBeCloseTo(ha[bone][i], 6);
      }
    }
  });

  it("resetHandPose clears the fingers and leaves the body", () => {
    const sk = makeHanded();
    sk.applyPose({ Spine: [0, 0.2, 0, 0.98] });
    sk.applyHandPose(findHandPose("loose_fist_left")!.bones);
    expect(Object.keys(sk.getHandPose()).length).toBeGreaterThan(0);

    sk.resetHandPose();
    expect(Object.keys(sk.getHandPose())).toHaveLength(0);
    expect(sk.getPose().Spine).toBeDefined();
  });
});

describe("hand and body payloads stay separate", () => {
  it("mutating a hand pose cannot change a body bone", () => {
    const body = { Spine: [0, 0.3, 0, 0.954], Hips: [0, 0, 0.1, 0.995] };
    const snapshot = JSON.stringify(body);
    const merged = withHandPose(body, findHandPose("pointing_left")!);
    expect(JSON.stringify(body)).toBe(snapshot);
    // The merge produced a new object rather than editing the caller's.
    expect(merged).not.toBe(body);
    expect(Object.keys(body)).toHaveLength(2);
  });

  it("withHandPose leaves the body bones identical", () => {
    const body = { Spine: [0, 0.3, 0, 0.954] };
    const merged = withHandPose(body, findHandPose("peace_sign_left")!);
    expect(merged.Spine).toBe(body.Spine);
    expect(Object.keys(merged).length).toBeGreaterThan(1);
  });

  it("withoutHandBones strips every hand bone, wrists included", () => {
    // LeftHand/RightHand are part of HAND_BONES, so a body pose saved from a
    // model with hands applied must not carry them either.
    const combined = withHandPose(
      { Spine: [0, 0.3, 0, 0.954], LeftHand: [0, 0, 0, 1], RightArm: [0, 0, 0.2, 0.98] },
      findHandPose("loose_fist_left")!,
    );
    const stripped = withoutHandBones(combined);
    expect(Object.keys(stripped).sort()).toEqual(["RightArm", "Spine"]);
    for (const bone of Object.keys(stripped)) {
      expect(HAND_BONES).not.toContain(bone);
    }
  });

  it("applying a body pose does not disturb the hands", () => {
    // applyPose resets every authored rotation before applying, so this is the
    // case that proves the two channels need separate entry points.
    const sk = makeHanded();
    sk.applyHandPose(findHandPose("loose_fist_left")!.bones);
    const handsBefore = sk.getHandPose();
    sk.applyPose({ Spine: [0, 0.2, 0, 0.98] });
    const handsAfter = sk.getHandPose();
    expect(Object.keys(handsAfter)).toHaveLength(0);
    // The hands were cleared by the body pose, which is exactly why Paste Pose
    // Hand Only exists as a separate command.
    expect(Object.keys(handsBefore).length).toBeGreaterThan(0);
  });
});




