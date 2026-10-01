// Authoring helper for hand-written poses.
//
// Writing 100 poses as raw quaternions is unreviewable and easy to get wrong,
// so poses are authored as Euler angles in degrees per bone and converted here.
// The angles read like joint instructions ("left elbow bent 90 degrees"),
// which is what an artist actually thinks in.

import * as THREE from "three";
import type { PoseData } from "../posing/PosableSkeleton";
import { FULL_PARENTS } from "../rig/RigContract";

const DEG2RAD = Math.PI / 180;

/**
 * Per-bone Euler angles in degrees, XYZ order, relative to the bone's bind
 * orientation. A bone omitted from the record stays at bind.
 */
export type PoseAngles = Readonly<
  Record<string, readonly [number, number, number]>
>;

/**
 * Optional per-pose root translation in metres, applied on top of the rig's
 * bind offset.
 *
 * The rig has no pelvis bone, and `Hips` is the skeleton root, so rotating it
 * spins the whole figure without lowering it. Seated and kneeling poses
 * therefore have to lower the root explicitly; without this the figure floats
 * above a chair or a floor.
 */
export type PoseRootOffset = readonly [number, number, number];

const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();

/**
 * Convert authored angles into a pose record of local quaternions.
 *
 * Angles are relative to the bind pose, so a pose authored on one model
 * reproduces exactly on another: both start from the same contract rest
 * orientation and apply the same relative rotation.
 */
export function anglesToPose(angles: PoseAngles): PoseData {
  const out: PoseData = {};
  for (const [bone, xyz] of Object.entries(angles)) {
    scratchEuler.set(
      xyz[0] * DEG2RAD,
      xyz[1] * DEG2RAD,
      xyz[2] * DEG2RAD,
      "XYZ",
    );
    scratchQuat.setFromEuler(scratchEuler);
    out[bone] = [scratchQuat.x, scratchQuat.y, scratchQuat.z, scratchQuat.w];
  }
  return out;
}

/**
 * Mirror a pose left-to-right.
 *
 * Swaps every Left/Right bone and negates the Y and Z rotation components,
 * which reflects a rotation about X through the YZ plane.
 */
export function mirrorPose(pose: PoseData): PoseData {
  const out: PoseData = {};
  for (const [bone, q] of Object.entries(pose)) {
    const swapped = swapSides(bone);
    // Normalise negative zero: JSON.stringify writes -0 as 0, so leaving it
    // in place would make a serialise/parse round-trip fail deep equality.
    out[swapped] = [norm(q[0]), norm(-q[1]), norm(-q[2]), norm(q[3])];
  }
  return out;
}

/**
 * Swap Left and Right in a bone name.
 *
 * The sentinel avoids a double substitution: replacing "Left" with "Right"
 * first would turn "RightArm" into "LeftArm" on the second pass.
 */
export function swapSides(bone: string): string {
  return bone
    .replace("Left", "\u0000")
    .replace("Right", "Left")
    .replace("\u0000", "Right");
}

/** Bone chains per limb, as the roots of each chain. */
export type LimbName = "arm" | "leg";

/**
 * The bones that belong to each limb, per the rig contract's parent map.
 *
 * Mirroring one limb is the feature artists actually reach for — "mirror just
 * the arms" — so the per-limb variants select bones by chain membership and
 * reuse swapSides rather than carrying their own bone map.
 */
export const LIMB_ROOTS: Readonly<Record<LimbName, readonly string[]>> = {
  arm: ["LeftArm", "RightArm"],
  leg: ["LeftUpLeg", "RightUpLeg"],
};

/** Every contract bone that descends from one of a limb's roots. */
export function limbBones(
  limb: LimbName,
  parents: Readonly<Record<string, string | null>> = FULL_PARENTS,
): string[] {
  const roots = new Set(LIMB_ROOTS[limb]);
  // Walk every bone whose ancestry reaches a root, so a limb picks up its
  // forearm, hand and fingers without being enumerated by hand.
  const inLimb = (bone: string): boolean => {
    let current: string | null = bone;
    // Guard against a malformed parent map looping rather than hanging.
    for (let depth = 0; current !== null && depth < 64; depth += 1) {
      if (roots.has(current)) return true;
      current = parents[current] ?? null;
    }
    return false;
  };
  return Object.keys(parents).filter(inLimb);
}

/**
 * Mirror one limb across the sagittal plane, leaving every other bone alone.
 *
 * This is the fix-one-side workflow: an artist holding a sword in the right
 * hand mirrors the arms and keeps the legs exactly as they were.
 */
export function mirrorLimb(
  pose: PoseData,
  limb: LimbName,
  parents: Readonly<Record<string, string | null>> = FULL_PARENTS,
): PoseData {
  const members = new Set(limbBones(limb, parents));
  const out: PoseData = { ...pose };
  for (const [bone, q] of Object.entries(pose)) {
    if (!members.has(bone)) continue;
    const swapped = swapSides(bone);
    out[swapped] = [norm(q[0]), norm(-q[1]), norm(-q[2]), norm(q[3])];
  }
  return out;
}

/** Turn -0 into 0 and leave every other value alone. */
function norm(n: number): number {
  return n === 0 ? 0 : n;
}

/** Merge pose records; later records win on conflicting bones. */
export function mergePoses(...poses: PoseData[]): PoseData {
  return Object.assign({}, ...poses);
}

/**
 * Add a rotation to one bone of an existing pose without disturbing others.
 * Used to derive variations (a wave is a gesture plus an arm angle).
 */
export function withBone(
  pose: PoseData,
  bone: string,
  xDeg: number,
  yDeg = 0,
  zDeg = 0,
): PoseData {
  return mergePoses(pose, anglesToPose({ [bone]: [xDeg, yDeg, zDeg] }));
}

/** True when a pose record is finite and safe to apply. */
export function isValidPose(pose: PoseData): boolean {
  return Object.values(pose).every(
    (q) =>
      q.length === 4 &&
      q.every((n) => typeof n === "number" && Number.isFinite(n)),
  );
}
