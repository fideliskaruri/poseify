// Hand poses: a payload separate from the body pose.
//
// a typical pose reference tool treats the hand as its own channel - Copy Pose (And Hand Pose),
// Paste Pose Hand Only, Load Pose from File Hand Only - because the actual
// workflow is: build a body pose once, then fix the hands. Bolting 40 finger
// bones onto the body pose record would make every hand change a body-pose
// change, which is exactly the coupling the separate channel exists to avoid.
//
// Authored in the same degrees-per-bone format as PoseLibrary, so a hand pose
// is readable and reviewable rather than an opaque quaternion dump.

import type { PoseData } from "../posing/PosableSkeleton";
import { HAND_BONES, type HandSide } from "../rig/RigContract";
import { anglesToPose, type PoseAngles } from "./PoseAuthoring";

/**
 * One hand's articulation.
 *
 * Separate from the body Pose on purpose. `side` is stored rather than implied
 * by the bone names so "paste the left hand" is expressible without inspecting
 * which bones happen to be present.
 */
export interface HandPose {
  id: string;
  name: string;
  side: HandSide;
  /** Finger-bone quaternions, keyed by full contract bone name. */
  bones: PoseData;
  tags: readonly string[];
}

/** Degrees per finger bone, the authoring format. */
export type HandPoseAngles = PoseAngles;

/**
 * Convert authored finger angles into a pose record.
 *
 * Deliberately does not fill in unlisted bones with identity: a hand pose that
 * mentioned every bone would overwrite whatever the model already had, and a
 * partial one should leave the rest alone.
 */
export function handAnglesToPose(angles: HandPoseAngles): PoseData {
  const pose = anglesToPose(angles);
  // Guard against an authored bone that is not a finger bone, which would
  // silently widen a hand pose into a body pose.
  for (const bone of Object.keys(pose)) {
    if (!HAND_BONES.includes(bone)) delete pose[bone];
  }
  return pose;
}

/** Bone names a hand pose touches, sorted, for UI display. */
export function handPoseBones(pose: HandPose): string[] {
  return Object.keys(pose.bones).sort();
}

/**
 * Bones this hand pose needs that a model does not have.
 *
 * The horse and the mermaids have no finger bones. Reporting exactly which ones
 * are missing is what turns a silent no-op into something the artist can act
 * on, and it matches how applyPose already reports missing bones.
 */
export function missingHandBones(
  pose: HandPose,
  knownBones: ReadonlySet<string>,
): string[] {
  return Object.keys(pose.bones).filter((bone) => !knownBones.has(bone));
}

/** True when every bone the pose needs is present on the model. */
export function canApplyHandPose(
  pose: HandPose,
  knownBones: ReadonlySet<string>,
): boolean {
  return missingHandBones(pose, knownBones).length === 0;
}

/**
 * Merge a hand pose onto a body pose, returning a new record.
 *
 * The two are separate payloads by design, so merging is an explicit act at the
 * point of application rather than something that happens implicitly.
 */
export function withHandPose(body: PoseData, hand: HandPose): PoseData {
  return { ...body, ...hand.bones };
}

/**
 * Strip the finger bones back out of a combined pose.
 *
 * Used when saving a body pose from a model that has hand poses applied, so the
 * saved body pose does not quietly carry the hands with it.
 */
export function withoutHandBones(body: PoseData): PoseData {
  const handSet = new Set(HAND_BONES);
  const out: PoseData = {};
  for (const [bone, q] of Object.entries(body)) {
    if (!handSet.has(bone)) out[bone] = q;
  }
  return out;
}
