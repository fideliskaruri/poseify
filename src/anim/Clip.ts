// Clip format: per-frame quaternions on the rig contract.
//
// Storing quaternions rather than raw ASF/AMC keeps the runtime payload small
// and means the browser never parses mocap formats. Built by
// tools/build-clips.ts; loaded by src/anim/ClipLibrary.ts.

export interface ClipFrame {
  // contract bone name -> local quaternion [x, y, z, w]
  rotations: Record<string, [number, number, number, number]>;
}

export interface AnimationClip {
  id: string;
  name: string;
  tags: readonly string[];
  frameRate: number;
  frameCount: number;
  durationSeconds: number;
  frames: ClipFrame[];
  // Contract bones this clip drives.
  drivenBones: readonly string[];
  // Root translation per frame in metres, when the source clip had one.
  translation?: [number, number, number][];
}

export interface ClipLibraryFile {
  version: 1;
  clips: AnimationClip[];
}

/**
 * Round a quaternion for compactness, then renormalise.
 *
 * Rounding each component independently can push the vector off the unit
 * sphere (a 4-decimal round of a valid quaternion lands ~0.5% short). Left
 * uncorrected that error accumulates across tens of thousands of frames, so it
 * is renormalised here rather than trusted.
 */
function quantiseComponent(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function quantiseQuat(
  q: [number, number, number, number],
  decimals = 4,
): [number, number, number, number] {
  const out = q.map((n) => quantiseComponent(n, decimals)) as [
    number,
    number,
    number,
    number,
  ];
  const length = Math.hypot(out[0], out[1], out[2], out[3]);
  if (length < 1e-9) return [0, 0, 0, 1];
  return [
    quantiseComponent(out[0] / length, decimals),
    quantiseComponent(out[1] / length, decimals),
    quantiseComponent(out[2] / length, decimals),
    quantiseComponent(out[3] / length, decimals),
  ];
}

export function clipToJson(clip: AnimationClip): string {
  const compact = {
    ...clip,
    frames: clip.frames.map((f) => {
      const rotations: Record<string, [number, number, number, number]> = {};
      for (const [bone, q] of Object.entries(f.rotations)) {
        rotations[bone] = quantiseQuat(q);
      }
      return { rotations };
    }),
  };
  return JSON.stringify(compact);
}

/** Parse a clip library, returning an empty library on malformed input. */
export function parseClipLibrary(text: string): ClipLibraryFile {
  try {
    const parsed = JSON.parse(text) as ClipLibraryFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.clips)) {
      return { version: 1, clips: [] };
    }
    return parsed;
  } catch {
    return { version: 1, clips: [] };
  }
}

export function findClip(
  library: ClipLibraryFile,
  id: string,
): AnimationClip | undefined {
  return library.clips.find((c) => c.id === id);
}

/** Free-text + tag filter for the clip picker. */
export function filterClips(
  clips: readonly AnimationClip[],
  options: { search?: string; tags?: readonly string[] } = {},
): AnimationClip[] {
  const { search = "", tags = [] } = options;
  const needle = search.trim().toLowerCase();
  const wanted = tags.map((t) => t.toLowerCase());

  return clips.filter((clip) => {
    if (wanted.length > 0) {
      const clipTags = clip.tags.map((t) => t.toLowerCase());
      if (!wanted.some((t) => clipTags.includes(t))) return false;
    }
    if (needle.length === 0) return true;
    if (clip.name.toLowerCase().includes(needle)) return true;
    return clip.tags.some((t) => t.toLowerCase().includes(needle));
  });
}

export function collectClipTags(clips: readonly AnimationClip[]): string[] {
  const tags = new Set<string>();
  for (const clip of clips) for (const t of clip.tags) tags.add(t);
  return [...tags].sort();
}

/**
 * Sample a clip at an arbitrary time.
 * Used by scrubbing, which must be able to freeze any frame as a static pose.
 */
export function sampleClip(clip: AnimationClip, timeSeconds: number): ClipFrame {
  if (clip.frameCount === 0) return { rotations: {} };
  const index = frameIndexAt(clip, timeSeconds);
  return clip.frames[index];
}

/** Frame index at a given time, clamped to the clip. */
export function frameIndexAt(clip: AnimationClip, timeSeconds: number): number {
  if (clip.frameCount === 0) return 0;
  const t = Math.max(0, timeSeconds) * clip.frameRate;
  return Math.min(clip.frameCount - 1, Math.max(0, Math.round(t)));
}
