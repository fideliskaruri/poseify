// Single source of truth for Poseify's skeleton convention.
// Mixamo / Maya humanoid naming, used by every retargeted model, every pose,
// and every mocap clip. Deviating breaks pose portability, which is the
// biggest failure mode in this product.

// 20 body bones. Order is canonical and matches the PoseMy bundle.
export const BODY_BONES = [
  "RightUpLeg",
  "LeftUpLeg",
  "LeftLeg",
  "RightLeg",
  "LeftFoot",
  "RightFoot",
  "LeftToeBase",
  "RightToeBase",
  "Hips",
  "Spine",
  "RightForeArm",
  "RightArm",
  "Neck",
  "Head",
  "LeftArm",
  "LeftForeArm",
  "Spine1",
  "Spine2",
  "LeftShoulder",
  "RightShoulder",
] as const;

export type BodyBoneName = (typeof BODY_BONES)[number];

// Finger families, in Mixamo order.
export const FINGER_NAMES = [
  "Index",
  "Middle",
  "Ring",
  "Pinky",
  "Thumb",
] as const;

export type FingerName = (typeof FINGER_NAMES)[number];

export const HAND_SIDES = ["Left", "Right"] as const;
export type HandSide = (typeof HAND_SIDES)[number];

// 42 hand bones: {Left,Right}Hand plus 20 finger bones per side.
export const HAND_BONES: readonly string[] = HAND_SIDES.flatMap((side) => {
  const hand = `${side}Hand`;
  const fingers = FINGER_NAMES.flatMap((finger) =>
    [1, 2, 3, 4].map((n) => `${hand}${finger}${n}`),
  );
  return [hand, ...fingers];
});

// Full canonical rig: 20 body bones + 42 hand bones = 62.
export const ALL_BONES: readonly string[] = [...BODY_BONES, ...HAND_BONES];

// Hip bone name (root of the skeleton).
export const HIP_BONE = "Hips";

// Parent map for the canonical rig. Expressing the contract as a parent map
// lets the retargeter validate hierarchy, not just naming.
export const RIG_PARENTS: Readonly<Record<string, string | null>> = {
  Hips: null,
  Spine: "Hips",
  Spine1: "Spine",
  Spine2: "Spine1",
  Neck: "Spine2",
  Head: "Neck",
  LeftShoulder: "Spine2",
  LeftArm: "LeftShoulder",
  LeftForeArm: "LeftArm",
  LeftHand: "LeftForeArm",
  RightShoulder: "Spine2",
  RightArm: "RightShoulder",
  RightForeArm: "RightArm",
  RightHand: "RightForeArm",
  LeftUpLeg: "Hips",
  LeftLeg: "LeftUpLeg",
  LeftFoot: "LeftLeg",
  LeftToeBase: "LeftFoot",
  RightUpLeg: "Hips",
  RightLeg: "RightUpLeg",
  RightFoot: "RightLeg",
  RightToeBase: "RightFoot",
};

export interface ValidationResult {
  ok: boolean;
  missing: string[];
  extra: string[];
}

// Validate a set of bone names against the canonical rig contract.
//
// ok is true when every required bone is present. extra is informational
// (helper bones, twist bones) and does not fail validation, because a valid
// humanoid may carry extra deform bones. missing always fails.
export function validateSkeleton(
  boneNames: readonly string[],
  options: { requireHands?: boolean } = {},
): ValidationResult {
  const requireHands = options.requireHands ?? false;
  const present = new Set(boneNames);

  const required: readonly string[] = requireHands ? ALL_BONES : BODY_BONES;
  const missing = required.filter((name) => !present.has(name));
  const requiredSet = new Set(required);
  const extra = boneNames.filter((name) => !requiredSet.has(name));

  return { ok: missing.length === 0, missing, extra };
}

// Chains used by the IK solver and the OpenPose exporter.
export const IK_CHAINS: Readonly<Record<string, readonly string[]>> = {
  LeftHand: ["LeftHand", "LeftForeArm", "LeftArm", "LeftShoulder"],
  RightHand: ["RightHand", "RightForeArm", "RightArm", "RightShoulder"],
  LeftFoot: ["LeftFoot", "LeftLeg", "LeftUpLeg"],
  RightFoot: ["RightFoot", "RightLeg", "RightUpLeg"],
};

// True when the bone is one of the 42 finger/hand bones.
export function isHandBone(name: string): boolean {
  return (
    name.endsWith("Hand") ||
    /Hand(Index|Middle|Ring|Pinky|Thumb)[1-4]$/.test(name)
  );
}
