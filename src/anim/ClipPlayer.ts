// Clip library loading and playback.
//
// The manifest is small and loads up front so the picker can list every clip;
// each clip's motion data is fetched only when it is first played. Without this
// split the browser would have to download the whole library before anything
// could play.

import {
  collectClipTags,
  filterClips,
  findClip,
  frameIndexAt,
  parseClipLibrary,
  sampleClip,
  clipToJson,
  type AnimationClip,
} from "./Clip";

export interface ClipSummary {
  id: string;
  name: string;
  tags: readonly string[];
  frameRate: number;
  frameCount: number;
  durationSeconds: number;
  drivenBones: readonly string[];
  hasTranslation: boolean;
  file: string;
}

export interface ClipLibrary {
  version: 1;
  clips: ClipSummary[];
}

const BASE = "/vendor/mocap";

let libraryPromise: Promise<ClipLibrary> | null = null;
const clipCache = new Map<string, AnimationClip>();

/** Load the clip manifest once and cache it. */
export function loadClipLibrary(): Promise<ClipLibrary> {
  if (libraryPromise) return libraryPromise;

  libraryPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/clips.json`);
      if (!res.ok) return { version: 1, clips: [] } as ClipLibrary;
      const parsed = JSON.parse(await res.text()) as ClipLibrary;
      if (parsed.version !== 1 || !Array.isArray(parsed.clips)) {
        return { version: 1, clips: [] };
      }
      return parsed;
    } catch {
      // Offline or blocked: the app still works, just with no clips.
      return { version: 1, clips: [] };
    }
  })();

  return libraryPromise;
}

/** Fetch one clip's motion data, cached after the first load. */
export async function loadClip(id: string): Promise<AnimationClip | null> {
  const cached = clipCache.get(id);
  if (cached) return cached;

  try {
    const res = await fetch(`${BASE}/clips/${id}.json`);
    if (!res.ok) return null;
    const clip = JSON.parse(await res.text()) as AnimationClip;
    clipCache.set(id, clip);
    return clip;
  } catch {
    return null;
  }
}

/**
 * Drives a clip onto a skeleton over time.
 *
 * Scrubbing to a frame and freezing it as a static pose is the core value
 * proposition of the tool, so `seek` is a first-class operation rather than an
 * internal detail of playback.
 */
export class ClipPlayer {
  playing = false;
  looping = true;
  /** Current position in seconds. */
  time = 0;
  /** Playback rate multiplier. */
  speed = 1;

  private clip: AnimationClip | null = null;

  onFrame:
    | ((frame: AnimationClip["frames"][number], index: number) => void)
    | null = null;
  onEnded: (() => void) | null = null;

  get current(): AnimationClip | null {
    return this.clip;
  }

  get duration(): number {
    return this.clip?.durationSeconds ?? 0;
  }

  get frameIndex(): number {
    if (!this.clip) return 0;
    return frameIndexAt(this.clip, this.time);
  }

  /** Load a clip and reset to its first frame. */
  async load(id: string): Promise<boolean> {
    const clip = await loadClip(id);
    if (!clip) return false;
    this.clip = clip;
    this.time = 0;
    this.playing = false;
    this.emit();
    return true;
  }

  play(): void {
    if (!this.clip) return;
    // Restarting from the end is what pressing play at the end expects.
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    this.time = 0;
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Jump to a time and emit that frame, whether playing or not. */
  seek(seconds: number): void {
    if (!this.clip) return;
    this.time = Math.max(0, Math.min(this.duration, seconds));
    this.emit();
  }

  /** Jump by whole frames, for frame-stepping. */
  step(frames: number): void {
    if (!this.clip) return;
    this.seek((this.frameIndex + frames) / this.clip.frameRate);
  }

  /**
   * Advance playback. Called each frame from the render loop, and freezes the
   * current pose onto the skeleton through onFrame.
   */
  update(deltaSeconds: number): void {
    if (!this.clip || !this.playing) return;

    this.time += deltaSeconds * this.speed;
    if (this.time >= this.duration) {
      if (this.looping) {
        this.time %= this.duration;
      } else {
        this.time = this.duration;
        this.playing = false;
        this.emit();
        this.onEnded?.();
        return;
      }
    }
    this.emit();
  }

  /** The pose at the current time, for freezing a frame as a static pose. */
  currentFrame(): AnimationClip["frames"][number] | null {
    if (!this.clip) return null;
    return sampleClip(this.clip, this.time);
  }

  private emit(): void {
    if (!this.clip) return;
    this.onFrame?.(this.clip.frames[this.frameIndex], this.frameIndex);
  }
}

export {
  collectClipTags,
  filterClips,
  findClip,
  frameIndexAt,
  sampleClip,
  parseClipLibrary,
  clipToJson,
};
export type { AnimationClip };
