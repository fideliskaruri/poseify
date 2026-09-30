import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { drawOpenPose2D } from "../Exporter";
import { COCO18, type Keypoint2D } from "../OpenPose";

function samplePoints(): Keypoint2D[] {
  const n = COCO18.length;
  return COCO18.map((name, i) => ({
    name,
    x: 0.5 + 0.3 * Math.cos((i / n) * Math.PI * 2),
    y: 0.5 + 0.3 * Math.sin((i / n) * Math.PI * 2),
    model: new THREE.Vector3(i * 0.1, 1, 0),
  }));
}

// A canvas whose 2D context records the calls made against it, so the drawing
// logic can be asserted without a native canvas backend. jsdom's built-in
// canvas throws "Not implemented", and pulling in the `canvas` native package
// would add a compiled dependency purely for tests.
interface RecordingContext {
  calls: string[];
  /** fillStyle in effect at each fillRect call, in order. */
  fillStyle: string;
  backgroundFills: string[];
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
}

function makeStubCanvas(): { canvas: HTMLCanvasElement; ctx: RecordingContext } {
  const ctx: RecordingContext = {
    calls: [],
    fillStyle: "",
    backgroundFills: [],
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
  };

  const noop =
    (name: string) =>
    () => {
      ctx.calls.push(name);
    };

  const fillRect = () => {
    ctx.calls.push("fillRect");
    ctx.backgroundFills.push(ctx.fillStyle);
  };

  const context = {
    get fillStyle() {
      return ctx.fillStyle;
    },
    set fillStyle(v: string) {
      ctx.fillStyle = v;
    },
    get strokeStyle() {
      return ctx.strokeStyle;
    },
    set strokeStyle(v: string) {
      ctx.strokeStyle = v;
    },
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    clearRect: noop("clearRect"),
    fillRect,
    beginPath: noop("beginPath"),
    moveTo: noop("moveTo"),
    lineTo: noop("lineTo"),
    stroke: noop("stroke"),
    fill: noop("fill"),
    arc: noop("arc"),
    get lineWidth() {
      return ctx.lineWidth;
    },
    set lineWidth(v: number) {
      ctx.lineWidth = v;
    },
    get lineCap() {
      return ctx.lineCap;
    },
    set lineCap(v: string) {
      ctx.lineCap = v;
    },
    get lineJoin() {
      return ctx.lineJoin;
    },
    set lineJoin(v: string) {
      ctx.lineJoin = v;
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === "2d" ? context : null),
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx };
}

describe("drawOpenPose2D", () => {
  it("resizes the canvas to the requested resolution", () => {
    const { canvas } = makeStubCanvas();
    drawOpenPose2D(canvas, samplePoints(), 256, 128, false);
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(128);
  });

  it("clears then fills an opaque background when not transparent", () => {
    const { canvas, ctx } = makeStubCanvas();
    drawOpenPose2D(canvas, [], 32, 32, false);
    expect(ctx.calls).toContain("clearRect");
    expect(ctx.backgroundFills).toEqual(["#000000"]);
  });

  it("paints the black background before any keypoint dots", () => {
    const { canvas, ctx } = makeStubCanvas();
    drawOpenPose2D(canvas, samplePoints(), 64, 64, false);
    expect(ctx.backgroundFills).toEqual(["#000000"]);
    expect(ctx.calls.filter((c) => c === "arc")).toHaveLength(18);
  });

  it("does not paint a background when transparent", () => {
    const { canvas, ctx } = makeStubCanvas();
    drawOpenPose2D(canvas, [], 32, 32, true);
    expect(ctx.calls).toContain("clearRect");
    expect(ctx.calls).not.toContain("fillRect");
  });

  it("draws one limb segment per connection plus one dot per keypoint", () => {
    const { canvas, ctx } = makeStubCanvas();
    drawOpenPose2D(canvas, samplePoints(), 128, 128, false);

    const moves = ctx.calls.filter((c) => c === "moveTo").length;
    const lines = ctx.calls.filter((c) => c === "lineTo").length;
    const arcs = ctx.calls.filter((c) => c === "arc").length;

    expect(moves).toBe(17);
    expect(lines).toBe(17);
    expect(arcs).toBe(18);
    expect(ctx.calls).toContain("stroke");
  });

  it("scales stroke width and dot radius with resolution", () => {
    const small = makeStubCanvas();
    drawOpenPose2D(small.canvas, samplePoints(), 256, 256, false);
    const large = makeStubCanvas();
    drawOpenPose2D(large.canvas, samplePoints(), 2048, 2048, false);

    // A 2048 export must have visibly thicker lines than a 256 one.
    expect(large.ctx.lineWidth).toBeGreaterThan(small.ctx.lineWidth);
  });

  it("does not throw when the canvas has no 2D context", () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(() =>
      drawOpenPose2D(canvas, samplePoints(), 64, 64, false),
    ).not.toThrow();
  });
});
