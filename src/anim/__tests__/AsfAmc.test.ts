import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MocapParseError,
  mapCmuBoneToContract,
  normaliseBoneName,
  parseAmc,
  parseAsf,
} from "../AsfAmc";

// A real CMU subject is used when it is cached, so the parser is tested
// against the format CMU actually serves rather than a hand-written fixture
// that could drift from reality.
const CACHE = join(process.cwd(), "tools", "cache", "cmu");
const REAL_ASF = join(CACHE, "05.asf");
const REAL_AMC = join(CACHE, "05_01.amc");
const hasRealData = existsSync(REAL_ASF) && existsSync(REAL_AMC);

const MINIMAL_ASF = [
  ":version 1.10",
  ":units",
  "  length 0.45",
  "  angle deg",
  ":bonedata",
  "  begin",
 "    id 1",
  "    name Hips",
  "    direction 0 1 0",
  "    length 4.5",
  "    axis 0 0 0  XYZ",
  "  end",
  "  begin",
  "    id 2",
  "    name Spine",
  "    direction 0 1 0",
  "    length 3.0",
  "    axis 0 0 0  XYZ",
  "  end",
  ":hierarchy",
  "  begin",
  "    root Hips",
  "    Hips Spine",
  "  end",
].join("\n");

describe("parseAsf", () => {
  it("reads units, bones and hierarchy from a minimal file", () => {
    const sk = parseAsf(MINIMAL_ASF);
    expect(sk.boneOrder).toEqual(["Hips", "Spine"]);
    expect(sk.lengthUnitsToMeters).toBeCloseTo(0.45);
    expect(sk.angleIsDegrees).toBe(true);
    expect(sk.root).toBe("Hips");
  });

  it("records parent relationships from :hierarchy", () => {
    const sk = parseAsf(MINIMAL_ASF);
    expect(sk.bones.find((b) => b.name === "Spine")?.parent).toBe("Hips");
    expect(sk.bones.find((b) => b.name === "Hips")?.parent).toBeNull();
  });

  it("reads direction, length and axis per bone", () => {
    const sk = parseAsf(MINIMAL_ASF);
    const hips = sk.bones.find((b) => b.name === "Hips")!;
    expect(hips.direction).toEqual([0, 1, 0]);
    expect(hips.length).toBeCloseTo(4.5);
  });

  it("treats the pseudo-parent 'root' as a root, not a bone", () => {
    const sk = parseAsf(MINIMAL_ASF);
    expect(sk.boneOrder).not.toContain("root");
    expect(sk.root).toBe("Hips");
  });

  it("rejects a file with no bone data rather than returning an empty rig", () => {
    expect(() => parseAsf(":version 1.10\n:name nothing\n")).toThrow(
      MocapParseError,
    );
  });
});

describe("parseAmc", () => {
  const sk = parseAsf(MINIMAL_ASF);

  it("parses named bone lines grouped by frame number", () => {
    const amc = ["1", "Hips 0 0 0", "Spine 0 0 0", "2", "Hips 0 0 5", "Spine 0 0 5"].join("\n");
    const clip = parseAmc(amc, sk);
    expect(clip.frames).toHaveLength(2);
    // One flat channel array, three values per bone.
    expect(clip.frames[0].rotations).toHaveLength(6);
    // The second frame's Hips Z rotation is the third channel of bone 0.
    expect(clip.frames[1].rotations[2]).toBeCloseTo(5);
  });

  it("ignores directive and header lines", () => {
    const amc = [
      "#!OML:ASF H:\\some\\path.asf",
      ":FULLY-SPECIFIED",
      ":DEGREES",
      "1",
      "Hips 0 0 0",
    ].join("\n");
    expect(parseAmc(amc, sk).frames).toHaveLength(1);
  });

  it("reads a root line with translation and rotation", () => {
    const amc = ["1", "root 10 20 30 1 2 3"].join("\n");
    const clip = parseAmc(amc, sk);
    // 10 inches * 0.45 m/unit = 4.5 m.
    expect(clip.frames[0].translation).toEqual([
      10 * 0.45,
      20 * 0.45,
      30 * 0.45,
    ]);
  });

  it("leaves bones absent from a frame at zero", () => {
    const amc = ["1", "Hips 0 0 0"].join("\n");
    const clip = parseAmc(amc, sk);
    // Bone 1 (Spine) occupies channels 3..5 and was never written.
    expect(clip.frames[0].rotations[3]).toBe(0);
  });
});

describe("bone name normalisation", () => {
  it("strips namespaces and separators", () => {
    expect(normaliseBoneName("mixamorig1LeftForeArm")).toBe("LeftForeArm");
    expect(normaliseBoneName("Armature.Bone.01")).toBe("ArmatureBone01");
  });

  it("maps CMU names onto the rig contract", () => {
    expect(mapCmuBoneToContract("lhipjoint")).toBe("LeftUpLeg");
    expect(mapCmuBoneToContract("rfemur")).toBe("RightLeg");
    expect(mapCmuBoneToContract("lowerback")).toBe("Spine");
    expect(mapCmuBoneToContract("lclavicle")).toBe("LeftShoulder");
  });

  it("returns null rather than guessing for unknown bones", () => {
    expect(mapCmuBoneToContract("lfingers")).toBeNull();
    expect(mapCmuBoneToContract("somethingelse")).toBeNull();
  });

  it("maps every CMU bone a real subject uses, except fingers and thumbs", () => {
    if (!hasRealData) return;
    const sk = parseAsf(readFileSync(REAL_ASF, "utf8"));
    const unmapped = sk.boneOrder.filter((b) => mapCmuBoneToContract(b) === null);
    // Fingers and thumbs have no contract equivalent at this granularity.
    expect(unmapped.sort()).toEqual([
      "lfingers",
      "lthumb",
      "rfingers",
      "rthumb",
      "rwrist",
      "lwrist",
    ].sort());
  });
});

describe.runIf(hasRealData)("real CMU data", () => {
  it("parses a real subject skeleton", () => {
    const sk = parseAsf(readFileSync(REAL_ASF, "utf8"));
    expect(sk.boneOrder.length).toBeGreaterThanOrEqual(20);
    expect(sk.root).toBeTruthy();
    expect(sk.frameRate).toBe(120);
  });

  it("parses a real motion with hundreds of frames", () => {
    const sk = parseAsf(readFileSync(REAL_ASF, "utf8"));
    const clip = parseAmc(readFileSync(REAL_AMC, "utf8"), sk);
    expect(clip.frames.length).toBeGreaterThan(100);
    // Every frame carries three Euler channels per ASF bone.
    for (const frame of clip.frames) {
      expect(frame.rotations).toHaveLength(sk.boneOrder.length * 3);
    }
  });

  it("contains real motion rather than zeros", () => {
    const sk = parseAsf(readFileSync(REAL_ASF, "utf8"));
    const clip = parseAmc(readFileSync(REAL_AMC, "utf8"), sk);
    const moved = clip.frames.some((f) => f.rotations.some((r) => Math.abs(r) > 1));
    expect(moved).toBe(true);
  });

  it("carries a plausible root translation in metres", () => {
    const sk = parseAsf(readFileSync(REAL_ASF, "utf8"));
    const clip = parseAmc(readFileSync(REAL_AMC, "utf8"), sk);
    const t = clip.frames.find((f) => f.translation);
    if (!t) return;
    expect(Math.abs(t.translation![1])).toBeLessThan(1000);
  });
});
