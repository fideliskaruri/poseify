// The hand-pose library.
//
// Authored in degrees per finger bone, in the same readable format as
// PoseLibrary, so each pose reads as joint instructions ("left index curls 70
// degrees") rather than an opaque quaternion dump and can be reviewed in a diff.
//
// Conventions: positive X curls a finger toward the palm, positive Y spreads a
// finger away from the palm, positive Z twists. The wrist (LeftHand /
// RightHand) is never included - it belongs to the arm chain, and rotating it
// here would fight the body pose rather than refine the hand.

import type { HandPose } from "./HandPose";
import { handAnglesToPose, type HandPoseAngles } from "./HandPose";
import type { HandSide } from "../rig/RigContract";

interface HandPoseSpec {
  id: string;
  name: string;
  tags: readonly string[];
  angles: HandPoseAngles;
}

/** Curling angles for one finger, proximal to distal. */
const CURL = (a: number, b: number, c: number): [number, number, number] => [a, b, c];
/** A straight finger. */
const FLAT: [number, number, number] = [0, 0, 0];

/**
 * Build the five fingers for one hand.
 *
 * Written as a function of side so the 32 authored numbers below are not
 * duplicated and mirrored by hand, which is how the two sides drift apart.
 */
function fingers(side: HandSide): HandPoseAngles {
  const s = `${side}Hand`;
  return {
    // Index, middle, ring and pinky share a curl pattern; the thumb sits
    // across the palm rather than curling in the same plane, so it gets its own.
    [`${s}Index1`]: CURL(60, 70, 50),
    [`${s}Index2`]: CURL(75, 80, 55),
    [`${s}Index3`]: CURL(55, 60, 40),
    [`${s}Middle1`]: CURL(65, 75, 55),
    [`${s}Middle2`]: CURL(80, 85, 60),
    [`${s}Middle3`]: CURL(60, 65, 45),
    [`${s}Ring1`]: CURL(65, 75, 55),
    [`${s}Ring2`]: CURL(80, 85, 60),
    [`${s}Ring3`]: CURL(60, 65, 45),
    [`${s}Pinky1`]: CURL(70, 75, 55),
    [`${s}Pinky2`]: CURL(75, 80, 60),
    [`${s}Pinky3`]: CURL(55, 60, 40),
    [`${s}Thumb1`]: CURL(25, 30, 60),
    [`${s}Thumb2`]: CURL(20, 25, 55),
    [`${s}Thumb3`]: CURL(15, 20, 45),
    [`${s}Thumb4`]: FLAT,
  };
}

/** Overwrite only the named bones, keeping the rest of a base pose. */
function tweak(
  base: HandPoseAngles,
  side: HandSide,
  overrides: Record<string, [number, number, number]>,
): HandPoseAngles {
  const s = `${side}Hand`;
  const out: Record<string, [number, number, number]> = { ...base };
  for (const [name, angles] of Object.entries(overrides)) {
    out[`${s}${name}`] = angles;
  }
  return out;
}

const SPECS: readonly HandPoseSpec[] = [
  {
    id: "relaxed_open",
    name: "Relaxed open hand",
    tags: ["relaxed", "open", "default", "rest"],
    // A hand at rest is not flat: the fingers curl very slightly and the thumb
    // falls away from the index. Flat fingers read as a hand corpse.
    angles: tweak(
      {
        [`LeftHandIndex1`]: CURL(8, 10, 6),
        [`LeftHandIndex2`]: CURL(10, 12, 8),
        [`LeftHandIndex3`]: CURL(8, 10, 6),
        [`LeftHandMiddle1`]: CURL(10, 12, 8),
        [`LeftHandMiddle2`]: CURL(12, 14, 9),
        [`LeftHandMiddle3`]: CURL(9, 11, 7),
        [`LeftHandRing1`]: CURL(11, 13, 9),
        [`LeftHandRing2`]: CURL(13, 15, 10),
        [`LeftHandRing3`]: CURL(10, 12, 8),
        [`LeftHandPinky1`]: CURL(13, 15, 10),
        [`LeftHandPinky2`]: CURL(15, 17, 11),
        [`LeftHandPinky3`]: CURL(11, 13, 9),
        [`LeftHandThumb1`]: CURL(12, 14, 20),
        [`LeftHandThumb2`]: CURL(10, 12, 18),
        [`LeftHandThumb3`]: CURL(8, 10, 14),
        [`LeftHandThumb4`]: FLAT,
      },
      "Left",
      {},
    ),
  },
  {
    id: "loose_fist",
    name: "Loose fist",
    tags: ["fist", "closed", "grip"],
    angles: tweak(fingers("Left"), "Left", {
      // A loose fist stops short of a white-knuckle curl, which is what makes it
      // usable as a default holding pose rather than a clenched one.
      Thumb1: CURL(55, 45, 30),
      Thumb2: CURL(45, 40, 25),
      Thumb3: CURL(35, 30, 20),
    }),
  },
  {
    id: "pointing",
    name: "Pointing",
    tags: ["point", "gesture", "one"],
    angles: tweak(fingers("Left"), "Left", {
      // Only the index extends; the rest stay curled, and the thumb braces
      // across them the way a real pointing hand does.
      Index1: CURL(8, 6, 4),
      Index2: CURL(6, 4, 2),
      Index3: CURL(4, 3, 2),
      Thumb1: CURL(45, 35, 25),
      Thumb2: CURL(40, 30, 20),
      Thumb3: CURL(30, 25, 15),
    }),
  },
  {
    id: "peace_sign",
    name: "Peace sign",
    tags: ["peace", "gesture", "two", "v"],
    angles: tweak(fingers("Left"), "Left", {
      Index1: CURL(6, 5, 3),
      Index2: CURL(4, 3, 2),
      Index3: CURL(3, 2, 1),
      Middle1: CURL(6, 5, 3),
      Middle2: CURL(4, 3, 2),
      Middle3: CURL(3, 2, 1),
      // Ring and pinky fold down, which is what separates a V from two fingers
      // held parallel.
      Ring1: CURL(85, 85, 60),
      Ring2: CURL(90, 90, 65),
      Ring3: CURL(70, 70, 50),
      Pinky1: CURL(90, 90, 65),
      Pinky2: CURL(95, 95, 70),
      Pinky3: CURL(75, 75, 55),
      Thumb1: CURL(50, 40, 25),
      Thumb2: CURL(45, 35, 20),
      Thumb3: CURL(35, 30, 18),
    }),
  },
  {
    id: "grip_cylinder",
    name: "Gripping cylinder",
    tags: ["grip", "hold", "prop", "cylinder", "handle"],
    angles: tweak(fingers("Left"), "Left", {
      // A cylinder is thicker than a fist, so the curl is shallower and the
      // thumb opposes rather than crosses.
      Index1: CURL(40, 45, 30),
      Index2: CURL(50, 55, 38),
      Index3: CURL(38, 42, 28),
      Middle1: CURL(42, 48, 32),
      Middle2: CURL(52, 58, 40),
      Middle3: CURL(40, 45, 30),
      Ring1: CURL(42, 48, 32),
      Ring2: CURL(52, 58, 40),
      Ring3: CURL(40, 45, 30),
      Pinky1: CURL(45, 50, 33),
      Pinky2: CURL(52, 58, 40),
      Pinky3: CURL(38, 43, 28),
      Thumb1: CURL(35, 30, 75),
      Thumb2: CURL(30, 25, 65),
      Thumb3: CURL(25, 20, 50),
    }),
  },
  {
    id: "grip_sphere",
    name: "Gripping sphere",
    tags: ["grip", "hold", "prop", "sphere", "ball"],
    angles: tweak(fingers("Left"), "Left", {
      // A ball is rounder than a cylinder, so the fingers curl further and the
      // thumb wraps more across them.
      Index1: CURL(55, 62, 45),
      Index2: CURL(65, 72, 52),
      Index3: CURL(50, 56, 40),
      Middle1: CURL(57, 64, 46),
      Middle2: CURL(67, 74, 54),
      Middle3: CURL(52, 58, 42),
      Ring1: CURL(57, 64, 46),
      Ring2: CURL(67, 74, 54),
      Ring3: CURL(52, 58, 42),
      Pinky1: CURL(60, 66, 48),
      Pinky2: CURL(67, 74, 54),
      Pinky3: CURL(50, 56, 40),
      Thumb1: CURL(60, 50, 40),
      Thumb2: CURL(55, 45, 35),
      Thumb3: CURL(45, 38, 28),
    }),
  },
  {
    id: "flat_palm",
    name: "Flat palm",
    tags: ["flat", "open", "palm", "stop"],
    // Every finger straight and the thumb laid along the side of the index.
    angles: {
      [`LeftHandIndex1`]: FLAT,
      [`LeftHandIndex2`]: FLAT,
      [`LeftHandIndex3`]: FLAT,
      [`LeftHandMiddle1`]: FLAT,
      [`LeftHandMiddle2`]: FLAT,
      [`LeftHandMiddle3`]: FLAT,
      [`LeftHandRing1`]: FLAT,
      [`LeftHandRing2`]: FLAT,
      [`LeftHandRing3`]: FLAT,
      [`LeftHandPinky1`]: FLAT,
      [`LeftHandPinky2`]: FLAT,
      [`LeftHandPinky3`]: FLAT,
      [`LeftHandThumb1`]: CURL(10, 8, 55),
      [`LeftHandThumb2`]: CURL(8, 6, 50),
      [`LeftHandThumb3`]: CURL(6, 5, 40),
      [`LeftHandThumb4`]: FLAT,
    },
  },
  {
    id: "prayer",
    name: "Prayer",
    tags: ["prayer", "pray", "together", "clasp"],
    angles: tweak(fingers("Left"), "Left", {
      // Prayer hands are a shallow curl, not a fist, with the fingers pressed
      // together rather than wrapped around anything.
      Index1: CURL(18, 22, 15),
      Index2: CURL(24, 28, 18),
      Index3: CURL(18, 22, 14),
      Middle1: CURL(18, 22, 15),
      Middle2: CURL(24, 28, 18),
      Middle3: CURL(18, 22, 14),
      Ring1: CURL(18, 22, 15),
      Ring2: CURL(24, 28, 18),
      Ring3: CURL(18, 22, 14),
      Pinky1: CURL(20, 24, 16),
      Pinky2: CURL(24, 28, 18),
      Pinky3: CURL(18, 22, 14),
      Thumb1: CURL(25, 20, 30),
      Thumb2: CURL(20, 16, 25),
      Thumb3: CURL(15, 12, 18),
    }),
  },
  {
    id: "thumbs_up",
    name: "Thumbs up",
    tags: ["thumbs", "up", "gesture", "approval"],
    angles: tweak(fingers("Left"), "Left", {
      // A closed fist with the thumb extended upward, which is why the fist is
      // the base rather than the relaxed open hand.
      Thumb1: CURL(5, 5, 80),
      Thumb2: CURL(3, 3, 70),
      Thumb3: CURL(2, 2, 55),
      Thumb4: FLAT,
    }),
  },
];

function buildFor(side: HandSide): HandPose[] {
  return SPECS.map((spec) => {
    // Mirror the authored left-hand angles for the right hand. Negating the
    // spread and twist components reflects the hand through the sagittal plane
    // while keeping the curl, which is the same rule mirrorPose applies to the
    // arm.
    const angles: Record<string, [number, number, number]> = {};
    for (const [bone, xyz] of Object.entries(spec.angles)) {
      const target = side === "Left" ? bone : bone.replace("Left", "Right");
      angles[target] =
        side === "Left" ? xyz : [xyz[0], -xyz[1], -xyz[2]];
    }
    return {
      id: `${spec.id}_${side.toLowerCase()}`,
      name: spec.name,
      side,
      bones: handAnglesToPose(angles),
      tags: spec.tags,
    };
  });
}

/** Every hand pose, both sides. */
export const HAND_POSE_LIBRARY: readonly HandPose[] = [
  ...buildFor("Left"),
  ...buildFor("Right"),
];

/** Poses for one side, in library order. */
export function handPosesForSide(side: HandSide): HandPose[] {
  return HAND_POSE_LIBRARY.filter((p) => p.side === side);
}

export function findHandPose(id: string): HandPose | undefined {
  return HAND_POSE_LIBRARY.find((p) => p.id === id);
}

/** Every tag in the hand library, sorted. */
export function collectHandTags(): string[] {
  const tags = new Set<string>();
  for (const pose of HAND_POSE_LIBRARY) for (const t of pose.tags) tags.add(t);
  return [...tags].sort();
}
