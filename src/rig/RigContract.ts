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

/**
 * Bones required for basic posing: the 20 body bones plus the two wrist bones.
 *
 * The wrist bones (LeftHand / RightHand) also appear in the 42-bone hand group,
 * but they are needed for any real posing work and are the IK end effectors for
 * the arm chains, so the retargeter always requires them. This keeps
 * BODY_BONES itself exactly as documented in FINDINGS.md while closing the gap.
 */
export const CORE_BONES: readonly string[] = [...BODY_BONES, "LeftHand", "RightHand"];

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

// Full canonical rig: 20 body bones + 42 hand bones = 62 (wrists appear in
// both groups, so the union is de-duplicated below).
export const ALL_BONES: readonly string[] = [
  ...new Set([...BODY_BONES, ...HAND_BONES]),
];

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

/**
 * Finger chains, appended to the body parent map.
 *
 * The 42 hand bones are already part of the contract (HAND_BONES) and the IK
 * chains treat the wrist as an arm-chain member, but the parent map stopped at
 * the wrist. Anything that walks the hierarchy to find a limb - per-limb pose
 * mirroring in particular - therefore could not see past LeftHand/RightHand,
 * so a mirrored arm silently dropped its fingers.
 *
 * Kept separate from RIG_PARENTS so the body map stays exactly the 22 entries
 * FINDINGS.md documents; this is merged only where the full hierarchy is
 * wanted.
 */
export const HAND_PARENTS: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const side of HAND_SIDES) {
    const hand = `${side}Hand`;
    for (const finger of FINGER_NAMES) {
      let parent = hand;
      for (let n = 1; n <= 4; n += 1) {
        const bone = `${hand}${finger}${n}`;
        out[bone] = parent;
        parent = bone;
      }
    }
  }
  return out;
})();

/** The complete hierarchy: 22 body bones plus the 40 finger bones. */
export const FULL_PARENTS: Readonly<Record<string, string | null>> = {
  ...RIG_PARENTS,
  ...HAND_PARENTS,
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

  const required: readonly string[] = requireHands ? ALL_BONES : CORE_BONES;
  const missing = required.filter((name) => !present.has(name));
  const requiredSet = new Set(required);
  const extra = boneNames.filter((name) => !requiredSet.has(name));

  return { ok: missing.length === 0, missing, extra };
}

// IK chains, effector first (PoseMy/bundle order). The solver reverses these
// into parent->child order. Single source of truth for the IK topology.
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
