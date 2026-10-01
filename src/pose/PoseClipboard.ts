// In-memory pose clipboard and a deterministic random-pose pick.
//
// PoseMy.Art separates Copy Pose / Paste Pose from scene save, because the
// actual workflow is: build a body pose on one figure, then carry it to
// another. A scene carries one whole setup; a pose carries one articulation.
//
// Session-only by design. A clipboard that outlived the tab would need storage
// and a conflict story for a workflow that is measured in seconds, and the
// app has no account or sync layer to hang it off.

import type { PoseData } from "../posing/PosableSkeleton";
import { isValidPose } from "./PoseAuthoring";

/**
 * One clipboard slot.
 *
 * Deliberately a single slot rather than a stack: Copy then Paste is the whole
 * interaction, and multiple slots would add a picker to solve a problem nobody
 * has.
 */
export interface ClipboardEntry {
  pose: PoseData;
  /** Bone count at copy time, so a truncated copy is visible in the UI. */
  boneCount: number;
  /** Where it came from, for the status line. */
  origin: string;
}

function clone(pose: PoseData): PoseData {
  const out: PoseData = {};
  for (const [bone, q] of Object.entries(pose)) {
    out[bone] = [q[0], q[1], q[2], q[3]];
  }
  return out;
}

export class PoseClipboard {
  private entry: ClipboardEntry | null = null;

  /**
   * Put a pose on the clipboard.
   *
   * An invalid pose is refused rather than stored: a clipboard that hands back
   * garbage would fail later at apply time, far from the mistake.
   */
  copy(pose: PoseData, origin = "pose"): boolean {
    if (!isValidPose(pose)) return false;
    this.entry = {
      pose: clone(pose),
      boneCount: Object.keys(pose).length,
      origin,
    };
    return true;
  }

  /** The held pose, or null. The returned object is a copy. */
  paste(): PoseData | null {
    return this.entry ? clone(this.entry.pose) : null;
  }

  get hasPose(): boolean {
    return this.entry !== null;
  }

  get summary(): ClipboardEntry | null {
    return this.entry
      ? { ...this.entry, pose: clone(this.entry.pose) }
      : null;
  }

  clear(): void {
    this.entry = null;
  }
}

/**
 * Deterministic pick from a library, for the Random pose button.
 *
 * Takes the index rather than choosing internally so the result is testable
 * and so the UI can avoid re-picking the same pose twice in a row.
 */
export function randomPoseIndex(count: number, seed: number): number {
  if (count <= 0) return -1;
  // An LCG keeps this dependency-free and reproducible for a given seed.
  let x = (seed * 1103515245 + 12345) & 0x7fffffff;
  x ^= x << 13;
  x &= 0x7fffffff;
  x ^= x >> 17;
  return x % count;
}
