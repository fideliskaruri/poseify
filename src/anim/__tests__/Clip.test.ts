import { describe, expect, it } from "vitest";
import {
  clipToJson,
  collectClipTags,
  filterClips,
  findClip,
  frameIndexAt,
  parseClipLibrary,
  sampleClip,
  type AnimationClip,
} from "../Clip";
import { ClipPlayer } from "../ClipPlayer";

function makeClip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  const frames = Array.from({ length: 30 }, (_, i) => ({
    rotations: {
      Spine: [0, Number(((i * 0.01) % 1).toFixed(4)), 0, 1] as [
        number,
        number,
        number,
        number,
      ],
    },
  }));
  return {
    id: "test",
    name: "Test Clip",
    tags: ["walking"],
    frameRate: 30,
    frameCount: 30,
    durationSeconds: 1,
    frames,
    drivenBones: ["Spine"],
    ...overrides,
  };
}

describe("clip format", () => {
  it("round-trips through JSON", () => {
    const clip = makeClip();
    const parsed = JSON.parse(clipToJson(clip)) as AnimationClip;
    expect(parsed.id).toBe(clip.id);
    expect(parsed.frames).toHaveLength(30);
  });

  it("quantises quaternions without breaking unit length", () => {
    const clip = makeClip({
      frames: [{ rotations: { Spine: [0.123456789, 0, 0, 0.987654321] } }],
      frameCount: 1,
    });
    const q = JSON.parse(clipToJson(clip)).frames[0].rotations.Spine;
    // Rounding is followed by a renormalise, so the stored value is the
    // rounded-then-corrected one and lands back on the unit sphere. The exact
    // digits shift slightly because the renormalise rounds a second time, so
    // the assertion is on the property that matters rather than a digit.
    expect(Math.hypot(...q)).toBeCloseTo(1, 3);
    expect(q[0]).toBeCloseTo(0.123456789, 2);
    expect(q.every((n: number) => Number.isFinite(n))).toBe(true);
  });

  it("returns an empty library for malformed input", () => {
    expect(parseClipLibrary("{not json").clips).toEqual([]);
    expect(parseClipLibrary(JSON.stringify({ version: 2 })).clips).toEqual([]);
  });

  it("finds a clip by id", () => {
    const lib = { version: 1 as const, clips: [makeClip()] };
    expect(findClip(lib, "test")?.id).toBe("test");
    expect(findClip(lib, "missing")).toBeUndefined();
  });
});

describe("clip sampling", () => {
  it("maps time to a frame index, clamped to the clip", () => {
    const clip = makeClip();
    expect(frameIndexAt(clip, 0)).toBe(0);
    expect(frameIndexAt(clip, 0.5)).toBe(15);
    expect(frameIndexAt(clip, -5)).toBe(0);
    expect(frameIndexAt(clip, 999)).toBe(29);
  });

  it("samples the pose at a time", () => {
    expect(sampleClip(makeClip(), 0.5).rotations.Spine[1]).toBeCloseTo(0.15, 4);
  });

  it("handles an empty clip without throwing", () => {
    const empty = makeClip({ frames: [], frameCount: 0 });
    expect(frameIndexAt(empty, 1)).toBe(0);
    expect(sampleClip(empty, 1)).toEqual({ rotations: {} });
  });
});

describe("clip filtering", () => {
  const clips = [
    makeClip({ id: "a", name: "Walk Fast", tags: ["walking"] }),
    makeClip({ id: "b", name: "Run", tags: ["running"] }),
    makeClip({ id: "c", name: "Slow Walk", tags: ["walking"] }),
  ];

  it("filters by tag", () => {
    expect(filterClips(clips, { tags: ["walking"] })).toHaveLength(2);
  });

  it("searches by name", () => {
    expect(filterClips(clips, { search: "run" })).toHaveLength(1);
  });

  it("collects the union of tags", () => {
    expect(collectClipTags(clips)).toEqual(["running", "walking"]);
  });
});

describe("ClipPlayer", () => {
  // A player preloaded with a clip, so tests do not hit the network.
  function playerWith(clip: AnimationClip): ClipPlayer {
    const player = new ClipPlayer();
    (player as unknown as { clip: AnimationClip }).clip = clip;
    return player;
  }

  it("starts stopped at frame 0", () => {
    const p = playerWith(makeClip());
    expect(p.playing).toBe(false);
    expect(p.time).toBe(0);
    expect(p.frameIndex).toBe(0);
    expect(p.duration).toBe(1);
  });

  it("advances time while playing", () => {
    const p = playerWith(makeClip());
    p.play();
    p.update(0.1);
    expect(p.time).toBeCloseTo(0.1, 6);
    expect(p.playing).toBe(true);
  });

  it("does not advance while paused", () => {
    const p = playerWith(makeClip());
    p.update(0.5);
    expect(p.time).toBe(0);
  });

  it("respects the speed multiplier", () => {
    const p = playerWith(makeClip());
    p.speed = 2;
    p.play();
    p.update(0.1);
    expect(p.time).toBeCloseTo(0.2, 6);
  });

  it("loops back to the start when it reaches the end", () => {
    const p = playerWith(makeClip());
    p.play();
    p.update(1.5);
    expect(p.time).toBeLessThan(1);
    expect(p.playing).toBe(true);
  });

  it("stops at the end when not looping", () => {
    const p = playerWith(makeClip());
    p.looping = false;
    p.play();
    p.update(5);
    expect(p.time).toBe(1);
    expect(p.playing).toBe(false);
  });

  it("calls onEnded when a non-looping clip finishes", () => {
    const p = playerWith(makeClip());
    p.looping = false;
    let ended = false;
    p.onEnded = () => {
      ended = true;
    };
    p.play();
    p.update(5);
    expect(ended).toBe(true);
  });

  it("seek works while paused, which is what scrubbing needs", () => {
    const p = playerWith(makeClip());
    let seenIndex = -1;
    p.onFrame = (_frame, index) => {
      seenIndex = index;
    };
    expect(p.playing).toBe(false);
    p.seek(0.5);
    expect(seenIndex).toBe(15);
    expect(p.time).toBeCloseTo(0.5, 6);
  });

  it("step moves by whole frames and clamps at the ends", () => {
    const p = playerWith(makeClip());
    p.seek(0);
    p.step(1);
    expect(p.frameIndex).toBe(1);
    p.step(-1);
    expect(p.frameIndex).toBe(0);
    p.step(-5);
    expect(p.frameIndex).toBe(0);
  });

  it("emits a real pose when a frame is scrubbed to", () => {
    const p = playerWith(makeClip());
    let bones: string[] = [];
    p.onFrame = (frame) => {
      bones = Object.keys(frame.rotations);
    };
    p.seek(0.5);
    expect(bones).toContain("Spine");
  });

  it("currentFrame returns the pose at the current time", () => {
    const p = playerWith(makeClip());
    p.seek(0.5);
    expect(p.currentFrame()?.rotations.Spine[1]).toBeCloseTo(0.15, 4);
  });

  it("stop resets to the beginning", () => {
    const p = playerWith(makeClip());
    p.play();
    p.update(0.5);
    p.stop();
    expect(p.time).toBe(0);
    expect(p.playing).toBe(false);
  });

  it("play from the end restarts", () => {
    const p = playerWith(makeClip());
    p.seek(1);
    p.play();
    expect(p.time).toBe(0);
  });

  it("toggle flips playback state", () => {
    const p = playerWith(makeClip());
    p.toggle();
    expect(p.playing).toBe(true);
    p.toggle();
    expect(p.playing).toBe(false);
  });

  it("ignores playback commands with no clip loaded", () => {
    const p = new ClipPlayer();
    expect(() => {
      p.play();
      p.update(1);
      p.seek(1);
      p.step(1);
      p.stop();
    }).not.toThrow();
    expect(p.currentFrame()).toBeNull();
  });
});
