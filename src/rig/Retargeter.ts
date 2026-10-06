import * as THREE from "three";
import {
  ALL_BONES,
  BODY_BONES,
  CORE_BONES,
  FULL_PARENTS,
  HIP_BONE,
  RIG_PARENTS,
  validateSkeleton,
  type ValidationResult,
} from "./RigContract";

export type MatchStrategy = "exact" | "alias" | "heuristic";

export interface BoneMatch {
  contractName: string;
  bone: THREE.Bone;
  strategy: MatchStrategy;
  length: number;
}

export interface RetargetResult {
  ok: boolean;
  matches: Map<string, BoneMatch>;
  missing: string[];
  unused: THREE.Bone[];
  validation: ValidationResult;
  errors: string[];
}

export interface RetargetOptions {
  requireHands?: boolean;
  /**
   * Seek the 40 finger bones without making them mandatory.
   *
   * requireHands demands all 62 names and fails validation when any is
   * missing, which is the right strictness for a test rig but the wrong one
   * for shipping: the horse and the mermaids have no fingers, and every
   * humanoid should still have *its* fingers bound so hand poses, hand export
   * and per-limb mirroring work.
   */
  bindFingers?: boolean;
  leftIsPositiveX?: boolean;
  throwOnFailure?: boolean;
}

// Common deviations found in the wild. Keys are normalised source names.
const ALIASES: Readonly<Record<string, string>> = {
  mixamorighips: HIP_BONE,
  pelvis: HIP_BONE,
  rootpelvis: HIP_BONE,
  root: HIP_BONE,
  skull: "Head",
  headtop: "Head",
  neck: "Neck",
  chest: "Spine2",
  upperchest: "Spine2",
  leftupperleg: "LeftUpLeg",
  rightupperleg: "RightUpLeg",
  leftthigh: "LeftUpLeg",
  rightthigh: "RightUpLeg",
  leftlowerleg: "LeftLeg",
  rightlowerleg: "RightLeg",
  leftcalf: "LeftLeg",
  rightcalf: "RightLeg",
  leftshin: "LeftLeg",
  rightshin: "RightLeg",
  leftknee: "LeftLeg",
  rightknee: "RightLeg",
  lefttoe: "LeftToeBase",
  righttoe: "RightToeBase",
  ltoe: "LeftToeBase",
  rtoe: "RightToeBase",
  clavicle_l: "LeftShoulder",
  clavicle_r: "RightShoulder",
  leftclavicle: "LeftShoulder",
  rightclavicle: "RightShoulder",
  lforearm: "LeftForeArm",
  rforearm: "RightForeArm",
  lhand: "LeftHand",
  rhand: "RightHand",
};

// Expected relative bone lengths in metres for a ~1.7 m reference human.
// Used only to rank heuristic candidates; absolute scale is irrelevant.
const EXPECTED_LENGTH: Readonly<Record<string, number>> = {
  Spine: 0.1,
  Spine1: 0.12,
  Spine2: 0.14,
  Neck: 0.09,
  Head: 0.12,
  LeftShoulder: 0.14,
  RightShoulder: 0.14,
  LeftArm: 0.28,
  RightArm: 0.28,
  LeftForeArm: 0.25,
  RightForeArm: 0.25,
  LeftHand: 0.09,
  RightHand: 0.09,
  LeftUpLeg: 0.42,
  RightUpLeg: 0.42,
  LeftLeg: 0.41,
  RightLeg: 0.41,
  LeftFoot: 0.08,
  RightFoot: 0.08,
  LeftToeBase: 0.07,
  RightToeBase: 0.07,
};

// Every contract bone is implicitly an alias of its own normalised form, so a
// namespaced export ("mixamorig:Hips" -> "hips") resolves without listing all
// 62 names by hand.
const CONTRACT_BY_NORMALISED: ReadonlyMap<string, string> = new Map(
  [...BODY_BONES, ...ALL_BONES].map((b) => [normalise(b), b]),
);

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-._:]/g, "")
    .replace(/_\d{3}$/, "");
}

// Namespaces used by Mixamo / Blender FBX exports, stripped before fuzzy match.
//
// Real observed forms from the a typical pose reference tool model set:
//   mixamorig1Hips        Blender glues the armature name on with no separator
//   mixamorigRightUpLeg   same, with no numeric suffix
//   mixamorig:Hips        colon-separated
//   mixamorig_LeftArm     underscore-separated
//
// The separator-less form is only stripped when the remainder starts with an
// uppercase letter, otherwise names like "righthip_thing" or "ring1" would be
// truncated by a looser pattern.
const NAMESPACE_PREFIX =
  /^(?:mixamorig|armature|bip|rig)[:_]\d*[:_]?|^(?:mixamorig|armature|bip|rig)\d*(?=[A-Z])/i;

function stripNamespace(name: string): string {
  return normalise(name.replace(NAMESPACE_PREFIX, ""));
}

function boneLength(bone: THREE.Bone): number {
  // Distance from the joint to the average world position of its child bones.
  // Leaf bones report 0.
  const children = bone.children.filter((c) => c instanceof THREE.Bone);
  if (children.length === 0) return 0;
  const origin = new THREE.Vector3();
  bone.getWorldPosition(origin);
  const child = new THREE.Vector3();
  let total = 0;
  for (const c of children) {
    c.getWorldPosition(child);
    total += child.distanceTo(origin);
  }
  return total / children.length;
}

function collectBones(root: THREE.Object3D): THREE.Bone[] {
  const out: THREE.Bone[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Bone) out.push(obj);
  });
  return out;
}

function sideFromName(name: string): "Left" | "Right" | null {
  const n = normalise(name);
  if (n.includes("left") || /(^|_)l$/.test(n) || n.endsWith("left")) return "Left";
  if (n.includes("right") || n.endsWith("right")) return "Right";
  return null;
}

// Map a fuzzy source name onto a contract bone name.
function contractBoneFromName(name: string): string | null {
  // Try both the namespace-stripped and fully normalised forms so that
  // "mixamorig:Hips", "mixamorig_hips" and "pelvis" all resolve.
  for (const n of [stripNamespace(name), normalise(name)]) {
    const direct = ALIASES[n];
    if (direct) return direct;
    const contract = CONTRACT_BY_NORMALISED.get(n);
    if (contract) return contract;
  }

  const stripped = stripNamespace(name);
  const side = sideFromName(stripped);
  if (!side) return null;

  const tail = stripped.replace(/^(left|right)/, "");
  const suffix: Record<string, string> = {
    shoulder: "Shoulder",
    arm: "Arm",
    forearm: "ForeArm",
    hand: "Hand",
    upleg: "UpLeg",
    upperleg: "UpLeg",
    thigh: "UpLeg",
    leg: "Leg",
    lowerleg: "Leg",
    calf: "Leg",
    shin: "Leg",
    knee: "Leg",
    foot: "Foot",
    ankle: "Foot",
    toebase: "ToeBase",
    toe: "ToeBase",
    index1: "HandIndex1",
    index2: "HandIndex2",
    index3: "HandIndex3",
    index4: "HandIndex4",
    middle1: "HandMiddle1",
    middle2: "HandMiddle2",
    middle3: "HandMiddle3",
    middle4: "HandMiddle4",
    ring1: "HandRing1",
    ring2: "HandRing2",
    ring3: "HandRing3",
    ring4: "HandRing4",
    pinky1: "HandPinky1",
    pinky2: "HandPinky2",
    pinky3: "HandPinky3",
    pinky4: "HandPinky4",
    thumb1: "HandThumb1",
    thumb2: "HandThumb2",
    thumb3: "HandThumb3",
    thumb4: "HandThumb4",
  };
  const s = suffix[tail];
  return s ? `${side}${s}` : null;
}

function depthOf(contractName: string): number {
  let d = 0;
  let cur: string | null = contractName;
  // FULL_PARENTS, not RIG_PARENTS: the body map stops at the wrist, so a
  // finger bone resolved to depth 0 and sorted alongside the root. The
  // heuristic then had no resolved parent to hang it under and silently
  // failed to bind any of the 40 finger bones.
  while (cur && FULL_PARENTS[cur]) {
    d += 1;
    cur = FULL_PARENTS[cur];
  }
  return d;
}

// Walk the contract hierarchy parent-first. For each unresolved contract bone,
// pick the best remaining candidate child of the resolved parent, scoring by
// name affinity, side agreement, then bone-length proximity to expectation.
function heuristicPass(
  sources: THREE.Bone[],
  required: readonly string[],
  consumed: Set<THREE.Bone>,
  matches: Map<string, BoneMatch>,
  leftIsPositiveX: boolean,
): void {
  const ordered = [...required].sort((a, b) => depthOf(a) - depthOf(b));
  const worldPos = new THREE.Vector3();

  for (const contractName of ordered) {
    if (matches.has(contractName)) continue;

    // Full hierarchy so a finger bone can find its wrist or its parent joint.
    const parentName = FULL_PARENTS[contractName];
    const parentBone = parentName ? matches.get(parentName)?.bone : undefined;

    const candidates = parentBone
      ? parentBone.children.filter(
          (c): c is THREE.Bone => c instanceof THREE.Bone && !consumed.has(c),
        )
      : sources.filter((b) => !consumed.has(b));

    let best: THREE.Bone | null = null;
    let bestScore = -Infinity;

    for (const cand of candidates) {
      let score = 0;
      if (contractBoneFromName(cand.name) === contractName) score += 100;

      if (contractName.startsWith("Left") || contractName.startsWith("Right")) {
        const wantLeft = contractName.startsWith("Left");
        cand.getWorldPosition(worldPos);
        const looksLeft = leftIsPositiveX ? worldPos.x >= 0 : worldPos.x < 0;
        score += looksLeft === wantLeft ? 10 : -10;
      }

      const len = boneLength(cand);
      const expected = EXPECTED_LENGTH[contractName];
      if (expected && len > 0) score -= Math.abs(len - expected) * 5;

      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best) {
      consumed.add(best);
      matches.set(contractName, {
        contractName,
        bone: best,
        strategy: "heuristic",
        length: boneLength(best),
      });
    }
  }
}

// Normalise an arbitrary skeleton onto the Poseify rig contract.
//
// Three tiers, in order:
//   1. exact contract-name match
//   2. alias / fuzzy name match (namespace-stripped, side + part detection)
//   3. hierarchy + bone-length heuristic, walked parent-first
//
// Unresolved bones land in `missing`. With throwOnFailure the function raises
// loudly instead of returning a half-rigged model.
/**
 * Map an arbitrary bone name onto a contract name, or null when it is not one.
 *
 * Exported so pose data from any source (vendor files, hand poses, imported
 * animation) is mapped through exactly the same rules the skeleton retargeter
 * uses. Re-deriving namespace and alias handling in a second place is how the
 * two drift apart and a pose silently lands on the wrong joint.
 */
export function resolveContractBoneName(name: string): string | null {
  return contractBoneFromName(name);
}

export function retargetSkeleton(
  root: THREE.Object3D,
  options: RetargetOptions = {},
): RetargetResult {
  const requireHands = options.requireHands ?? false;
  const bindFingers = options.bindFingers ?? false;
  const leftIsPositiveX = options.leftIsPositiveX ?? true;
  // bindFingers seeks the 40 finger bones without requiring them. requireHands
  // demands all 62 and is the strict mode; the two are independent because a
  // model that legitimately has no fingers should still load.
  const required: readonly string[] =
    requireHands || bindFingers ? ALL_BONES : CORE_BONES;

  const sources = collectBones(root);
  const consumed = new Set<THREE.Bone>();
  const matches = new Map<string, BoneMatch>();
  const errors: string[] = [];

  // Tier 1: exact name match.
  const byExactName = new Map<string, THREE.Bone>();
  for (const bone of sources) {
    if (!byExactName.has(bone.name)) byExactName.set(bone.name, bone);
  }
  for (const contractName of required) {
    const bone = byExactName.get(contractName);
    if (bone && !consumed.has(bone)) {
      consumed.add(bone);
      matches.set(contractName, {
        contractName,
        bone,
        strategy: "exact",
        length: boneLength(bone),
      });
    }
  }

  // Tier 2: alias match.
  for (const bone of sources) {
    if (consumed.has(bone)) continue;
    const mapped = contractBoneFromName(bone.name);
    if (!mapped || !required.includes(mapped) || matches.has(mapped)) continue;
    consumed.add(bone);
    matches.set(mapped, {
      contractName: mapped,
      bone,
      strategy: "alias",
      length: boneLength(bone),
    });
  }

  // Tier 3: heuristic.
  heuristicPass(sources, required, consumed, matches, leftIsPositiveX);

  // With bindFingers the finger bones are best-effort, so only the core
  // contract is treated as required. Reporting 40 missing fingers on a model
  // that genuinely has none would be noise, and failing on them would stop the
  // horse from loading at all.
  const mustHave = requireHands ? required : CORE_BONES;
  const missing = mustHave.filter((n) => !matches.has(n));
  const unused = sources.filter((b) => !consumed.has(b));

  if (sources.length === 0) {
    errors.push("No THREE.Bone instances found under the supplied root.");
  }
  if (missing.length > 0) {
    errors.push(
      `Skeleton does not match the Poseify rig contract. ` +
        `Unresolved bones (${missing.length}): ${missing.join(", ")}`,
    );
  }

  const result: RetargetResult = {
    ok: missing.length === 0 && sources.length > 0,
    matches,
    missing,
    unused,
    validation: validateSkeleton(
      sources.map((b) => b.name),
      { requireHands: requireHands || bindFingers },
    ),
    errors,
  };

  if (options.throwOnFailure && !result.ok) {
    throw new Error(`retargetSkeleton failed: ${errors.join(" ")}`);
  }

  return result;
}

export { HIP_BONE };

