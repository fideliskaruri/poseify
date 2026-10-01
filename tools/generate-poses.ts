// Combinatorial pose generator.
//
// Phase 7 of the parity work. PoseMy.Art's moat is content, not software:
// 6300+ poses against Poseify's 98. The reason that gap is tractable here is
// that Poseify's poses are *authored degrees* - readable joint instructions,
// not opaque quaternions - so they are machine-expandable.
//
// The axes are the ones an artist actually thinks in: what the body is doing,
// which way it faces, where the arms are, where the weight is, how the spine
// and head are set. That is 9 x 4 x 6 x 3 x 4 x 4 = 10,368 combinations before
// pruning.
//
// Everything here is MIT-clean: the poses are computed from this file, not
// copied from anyone's library.
//
// GENERATED-AT BUILD TIME. tools/generate-poses.ts runs this and writes the
// result to src/pose/GeneratedPoseLibrary.ts. Do not hand-edit the output.

import type { PoseAngles } from "../src/pose/PoseAuthoring";

/** One axis of variation and the tags it contributes. */
export interface Axis<T extends string> {
  key: T;
  label: string;
  tags: readonly string[];
  /** Angles applied on top of the running pose. */
  apply(base: PoseAngles, side: "Left" | "Right" | "both"): PoseAngles;
}

/** A generated pose, before validation. */
export interface GeneratedPose {
  id: string;
  name: string;
  tags: readonly string[];
  angles: PoseAngles;
  /** Root drop in metres, for grounded vs seated poses. */
  rootOffset?: [number, number, number];
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/**
 * Whether a pose is grounded, i.e. both feet are expected to be on the floor.
 *
 * Only grounded poses get the ground-contact check. A lying or kneeling pose
 * legitimately has no foot contact, and testing it would reject the poses that
 * are most useful.
 */
const GROUNDED_ACTIONS = new Set([
  "stand",
  "walk",
  "run",
  "fight",
  "aim",
  "dance",
  "gesture",
]);

// ------------------------------------------------------------------ actions

/**
 * What the body is doing.
 *
 * Root drops follow the existing library: the rig has no pelvis bone and Hips
 * is the skeleton root, so a seated or kneeling pose must lower the root
 * explicitly or the figure floats above the prop.
 */
export const ACTIONS: readonly Axis<"stand" | "walk" | "run" | "fight" | "aim" | "kneel" | "lying" | "dance" | "gesture">[] = [
  {
    key: "stand",
    label: "Standing",
    tags: ["standing"],
    apply: () => ({}),
  },
  {
    key: "walk",
    label: "Walking",
    tags: ["walking"],
    apply: () => ({
      LeftUpLeg: [-22, 0, 3],
      RightUpLeg: [22, 0, -3],
      LeftLeg: [12, 0, 0],
      RightLeg: [26, 0, 0],
      LeftArm: [18, 0, 6],
      RightArm: [-18, 0, -6],
      Spine: [0, 4, 0],
    }),
  },
  {
    key: "run",
    label: "Running",
    tags: ["running"],
    apply: () => ({
      LeftUpLeg: [-42, 0, 4],
      RightUpLeg: [38, 0, -4],
      LeftLeg: [22, 0, 0],
      RightLeg: [58, 0, 0],
      LeftArm: [46, 0, 10],
      RightArm: [-30, 0, -14],
      Spine: [0, 12, 0],
      Neck: [0, -6, 0],
    }),
  },
  {
    key: "fight",
    label: "Fighting",
    tags: ["fighting"],
    apply: () => ({
      LeftArm: [-24, 0, 38],
      RightArm: [18, 0, -34],
      LeftForeArm: [0, 0, 62],
      RightForeArm: [0, 0, 78],
      LeftUpLeg: [-14, 0, 12],
      RightUpLeg: [16, 0, -10],
      Spine: [0, 18, 0],
      Hips: [0, 14, 0],
    }),
  },
  {
    key: "aim",
    label: "Aiming",
    tags: ["aiming"],
    apply: () => ({
      LeftArm: [-62, 0, 12],
      RightArm: [-64, 0, -8],
      LeftForeArm: [0, 0, 74],
      RightForeArm: [0, 0, 82],
      Spine: [0, 26, 0],
      Neck: [0, -20, 0],
      LeftUpLeg: [-10, 0, 6],
      RightUpLeg: [8, 0, -6],
    }),
  },
  {
    key: "kneel",
    label: "Kneeling",
    tags: ["kneeling"],
    apply: () => ({
      LeftUpLeg: [-88, 0, 6],
      RightUpLeg: [-88, 0, -6],
      LeftLeg: [86, 0, 0],
      RightLeg: [86, 0, 0],
      LeftArm: [10, 0, 14],
      RightArm: [10, 0, -14],
      Spine: [6, 0, 0],
    }),
  },
  {
    key: "lying",
    label: "Lying",
    tags: ["lying"],
    apply: () => ({
      Hips: [-88, 0, 0],
      Spine: [8, 0, 0],
      LeftUpLeg: [-6, 0, 8],
      RightUpLeg: [-4, 0, -8],
      LeftArm: [12, 0, 26],
      RightArm: [12, 0, -26],
      Neck: [0, 0, -6],
    }),
  },
  {
    key: "dance",
    label: "Dancing",
    tags: ["dancing"],
    apply: () => ({
      LeftArm: [-38, 0, 74],
      RightArm: [-34, 0, -70],
      LeftForeArm: [0, 0, 42],
      RightForeArm: [0, 0, 38],
      Spine: [0, -14, 8],
      Hips: [0, -10, 0],
      Neck: [0, 8, 0],
    }),
  },
  {
    key: "gesture",
    label: "Gesturing",
    tags: ["gesture"],
    apply: () => ({
      LeftArm: [-26, 0, 22],
      RightArm: [-14, 0, -12],
      LeftForeArm: [0, 0, 58],
      RightForeArm: [0, 0, 26],
      Spine: [0, -6, 0],
    }),
  },
];

// ------------------------------------------------------------------ facing

/** Which way the figure faces, applied to Hips yaw. */
export const FACINGS: readonly Axis<"front" | "three_quarter" | "side" | "back">[] = [
  { key: "front", label: "Front", tags: ["front"], apply: () => ({}) },
  {
    key: "three_quarter",
    label: "Three Quarter",
    tags: ["three-quarter"],
    apply: () => ({ Hips: [0, 34, 0], Spine: [0, 8, 0], Neck: [0, -6, 0] }),
  },
  {
    key: "side",
    label: "Side",
    tags: ["side"],
    apply: () => ({ Hips: [0, 72, 0], Spine: [0, 6, 0], Neck: [0, -8, 0] }),
  },
  {
    key: "back",
    label: "Back",
    tags: ["back"],
    apply: () => ({ Hips: [0, 168, 0], Spine: [0, 6, 0], Neck: [0, -6, 0] }),
  },
];

// -------------------------------------------------------------- arm states

/**
 * Where the arms are.
 *
 * Applied symmetrically via the side argument, so "at side" cannot drift
 * between arms the way hand-written left/right pairs do.
 */
export const ARM_STATES: readonly Axis<"at_side" | "crossed" | "raised" | "overhead" | "forward" | "on_hip">[] = [
  {
    key: "at_side",
    label: "Arms at Side",
    tags: ["arms-down"],
    apply: (_b, side) => (side === "both" ? { LeftArm: [0, 0, 5], RightArm: [0, 0, -5] } : {}),
  },
  {
    key: "crossed",
    label: "Arms Crossed",
    tags: ["arms-crossed"],
    apply: (_b, side) =>
      side === "both"
        ? { LeftArm: [-42, 0, 30], RightArm: [-38, 0, -34], LeftForeArm: [0, 0, 86], RightForeArm: [0, 0, 92] }
        : {},
  },
  {
    key: "raised",
    label: "Arms Raised",
    tags: ["arms-raised"],
    apply: (_b, side) =>
      side === "both"
        ? { LeftArm: [0, 0, 62], RightArm: [0, 0, -62], LeftForeArm: [0, 0, 18], RightForeArm: [0, 0, 18] }
        : {},
  },
  {
    key: "overhead",
    label: "Arms Overhead",
    tags: ["arms-overhead"],
    apply: (_b, side) =>
      side === "both"
        ? { LeftArm: [-8, 0, 148], RightArm: [-8, 0, -148], LeftForeArm: [0, 0, 12], RightForeArm: [0, 0, 12] }
        : {},
  },
  {
    key: "forward",
    label: "Arms Forward",
    tags: ["arms-forward"],
    apply: (_b, side) =>
      side === "both"
        ? { LeftArm: [-76, 0, 10], RightArm: [-76, 0, -10], LeftForeArm: [0, 0, 14], RightForeArm: [0, 0, 14] }
        : {},
  },
  {
    key: "on_hip",
    label: "Hand on Hip",
    tags: ["hand-on-hip"],
    apply: (_b, side) =>
      side === "both"
        ? { LeftArm: [24, 0, 24], RightArm: [22, 0, -46], LeftForeArm: [0, 0, 74], RightForeArm: [0, 0, 80] }
        : {},
  },
];

// ------------------------------------------------------- weight distribution

export const WEIGHTS: readonly Axis<"even" | "left" | "right">[] = [
  { key: "even", label: "Weight Even", tags: [], apply: () => ({}) },
  {
    key: "left",
    label: "Weight on Left",
    tags: ["weight-left"],
    apply: () => ({ LeftUpLeg: [0, 0, 9], RightUpLeg: [0, 0, -4], Hips: [0, 0, -5], Spine: [0, 0, 4] }),
  },
  {
    key: "right",
    label: "Weight on Right",
    tags: ["weight-right"],
    apply: () => ({ LeftUpLeg: [0, 0, -4], RightUpLeg: [0, 0, 9], Hips: [0, 0, 5], Spine: [0, 0, -4] }),
  },
];

// ------------------------------------------------------------------- spine

export const SPINES: readonly Axis<"upright" | "lean_forward" | "lean_back" | "twist">[] = [
  { key: "upright", label: "Upright", tags: [], apply: () => ({}) },
  {
    key: "lean_forward",
    label: "Leaning Forward",
    tags: ["lean-forward"],
    apply: () => ({ Spine: [12, 0, 0], Spine1: [8, 0, 0], Spine2: [6, 0, 0], Neck: [-8, 0, 0] }),
  },
  {
    key: "lean_back",
    label: "Leaning Back",
    tags: ["lean-back"],
    apply: () => ({ Spine: [-12, 0, 0], Spine1: [-7, 0, 0], Spine2: [-5, 0, 0], Neck: [6, 0, 0] }),
  },
  {
    key: "twist",
    label: "Twisted",
    tags: ["twist"],
    apply: () => ({ Spine: [0, 16, 0], Spine1: [0, 12, 0], Spine2: [0, 8, 0], Hips: [0, -8, 0], Neck: [0, -10, 0] }),
  },
];

// -------------------------------------------------------------------- head

export const HEADS: readonly Axis<"level" | "turned" | "up" | "down">[] = [
  { key: "level", label: "Head Level", tags: [], apply: () => ({}) },
  {
    key: "turned",
    label: "Head Turned",
    tags: ["head-turned"],
    apply: () => ({ Neck: [0, 26, 0], Head: [0, 12, 0] }),
  },
  {
    key: "up",
    label: "Head Up",
    tags: ["head-up"],
    apply: () => ({ Neck: [-18, 0, 0], Head: [-10, 0, 0] }),
  },
  {
    key: "down",
    label: "Head Down",
    tags: ["head-down"],
    apply: () => ({ Neck: [16, 0, 0], Head: [10, 0, 0] }),
  },
];

/** Merge angle records; later wins per bone. */
export function mergeAngles(...records: (PoseAngles | undefined)[]): PoseAngles {
  const out: Record<string, [number, number, number]> = {};
  for (const record of records) {
    if (!record) continue;
    for (const [bone, xyz] of Object.entries(record)) {
      out[bone] = [...xyz] as [number, number, number];
    }
  }
  return out;
}

/**
 * Add two angle records per bone rather than replacing.
 *
 * The axes are authored as absolute joint instructions, so combining "arms
 * overhead" with "leaning forward" should bend the spine without cancelling
 * the arms. Replacement would drop whichever axis was applied last.
 */
export function addAngles(base: PoseAngles, add: PoseAngles): PoseAngles {
  const out: Record<string, [number, number, number]> = {};
  for (const [bone, xyz] of Object.entries(base)) {
    out[bone] = [...xyz] as [number, number, number];
  }
  for (const [bone, xyz] of Object.entries(add)) {
    const current = out[bone] ?? [0, 0, 0];
    out[bone] = [
      clamp(current[0] + xyz[0], -180, 180),
      clamp(current[1] + xyz[1], -180, 180),
      clamp(current[2] + xyz[2], -180, 180),
    ];
  }
  return out;
}

/** Title-case a key for a readable pose name. */
function titleCase(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface GeneratorOptions {
  /** Cap on emitted poses, so a runaway axis set cannot ship 10k entries. */
  limit?: number;
  /** Only emit poses whose tag list includes this tag. */
  requireTag?: string;
}

/**
 * Generate every combination of the axes.
 *
 * Deterministic: the same options always produce the same ids, names and
 * values, so regenerating the library produces an empty diff unless an axis
 * actually changed.
 */
export function generatePoses(options: GeneratorOptions = {}): GeneratedPose[] {
  const { limit = Infinity } = options;
  const out: GeneratedPose[] = [];

  for (const action of ACTIONS) {
    for (const facing of FACINGS) {
      for (const arm of ARM_STATES) {
        for (const weight of WEIGHTS) {
          for (const spine of SPINES) {
            for (const head of HEADS) {
              const angles = addAngles(
                addAngles(
                  addAngles(
                    addAngles(
                      addAngles(action.apply({}, "both"), facing.apply({}, "both")),
                      arm.apply({}, "both"),
                    ),
                    weight.apply({}, "both"),
                  ),
                  spine.apply({}, "both"),
                ),
                head.apply({}, "both"),
              );

              const id = `gen_${action.key}_${facing.key}_${arm.key}_${weight.key}_${spine.key}_${head.key}`;
              const tags = [
                ...action.tags,
                ...facing.tags,
                ...arm.tags,
                ...weight.tags,
                ...spine.tags,
                ...head.tags,
                ...groundedTag(action.key),
              ];

              out.push({
                id,
                name: [
                  titleCase(action.label),
                  facing.label,
                  arm.label,
                  weight.label === "Weight Even" ? "" : weight.label,
                  spine.label === "Upright" ? "" : spine.label,
                  head.label === "Head Level" ? "" : head.label,
                ]
                  .filter(Boolean)
                  .join(", "),
                tags: [...new Set(tags)],
                angles,
                rootOffset: rootOffsetFor(action.key),
              });

              if (out.length >= limit) return out;
            }
          }
        }
      }
    }
  }
  return out;
}

function groundedTag(action: string): string {
  return GROUNDED_ACTIONS.has(action) ? "grounded" : "airborne";
}

/**
 * Root drop per action, in metres.
 *
 * Matches the convention in the hand-written library: the rig has no pelvis
 * bone and Hips is the skeleton root, so a seated or kneeling pose has to lower
 * the root explicitly or the figure floats above the prop.
 */
export function rootOffsetFor(action: string): [number, number, number] | undefined {
  switch (action) {
    case "kneel":
      return [0, -0.52, 0];
    case "lying":
      return [0, -0.08, 0];
    default:
      return undefined;
  }
}

/** Total combinations the axes can produce, for reporting. */
export const COMBINATION_COUNT =
  ACTIONS.length *
  FACINGS.length *
  ARM_STATES.length *
  WEIGHTS.length *
  SPINES.length *
  HEADS.length;
