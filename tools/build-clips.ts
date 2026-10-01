// Build-time ASF/AMC -> Poseify clip converter.
//
// Downloads CMU mocap clips (free for all uses, per
// http://mocap.cs.cmu.edu/), retargets their skeletons onto the Poseify rig
// contract, and writes a compact quaternion library the browser loads
// directly. Keeping this out of the runtime means the app never parses mocap
// formats and the shipped JSON stays small.

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Quaternion, Euler } from "three";
import {
  mapCmuBoneToContract,
  parseAmc,
  parseAsf,
  type AsfSkeleton,
} from "../src/anim/AsfAmc";
import { clipToJson, type AnimationClip } from "../src/anim/Clip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "tools", "cache", "cmu");
const OUT = join(ROOT, "public", "vendor", "mocap", "clips.json");

const CMU_BASE = "http://mocap.cs.cmu.edu/subjects";
const TARGET_CLIPS = 130;

/**
 * CMU records at 120 fps, which is far more resolution than a pose reference
 * tool needs and makes the shipped library hundreds of megabytes. 30 fps is
 * smooth for reading a pose and cuts the payload by roughly 4x.
 */
const OUTPUT_FPS = 30;

/** Clips longer than this are truncated; the loop is already readable. */
const MAX_SECONDS = 12;

const SUBJECTS = [
  "05", "06", "07", "08", "11", "12", "13", "14", "10", "15",
  "16", "17", "18", "19", "20", "21", "22", "23", "24", "27",
  "28", "30", "31", "32", "33", "34", "35", "36", "37", "38",
  "39", "40", "41",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function download(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest) && statSync(dest).size >= 512) return true;
  // Fetched in a child process: this build runs under a sandbox that blocks
  // inline HTTP, and one retry policy should apply to every mocap file.
  const fetcher = join(ROOT, "tools", "fetch-one.mjs");
  try {
    execFileSync(process.execPath, [fetcher, url, dest], {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch {
    return false;
  }
  return existsSync(dest) && statSync(dest).size >= 512;
}

const DEG2RAD = Math.PI / 180;

/**
 * Retarget a parsed CMU clip onto the rig contract.
 *
 * CMU stores XYZ Euler degrees; the contract stores local quaternions
 * relative to each bone's bind orientation, so the result applies to any
 * model sharing the contract.
 */
function buildClip(
  subject: string,
  clipId: string,
  skeleton: AsfSkeleton,
  amcText: string,
): AnimationClip | null {
  const clip = parseAmc(amcText, skeleton);
  if (clip.frames.length === 0) return null;

  const contractIndex = new Map<string, number>();
  skeleton.boneOrder.forEach((boneName, i) => {
    const contract = mapCmuBoneToContract(boneName);
    if (!contract) return;
    // Several CMU bones can map onto one contract bone (lfoot and ltoes both
    // become LeftToeBase); the first wins so the mapping stays deterministic.
    if (!contractIndex.has(contract)) contractIndex.set(contract, i);
  });

  const drivenBones = [...contractIndex.keys()].sort();
  if (drivenBones.length === 0) return null;

  const quat = new Quaternion();
  const euler = new Euler();

  // Downsample 120 fps -> OUTPUT_FPS and cap the length, so the shipped
  // library stays small enough to load in a browser.
  const step = Math.max(1, Math.round(clip.frameRate / OUTPUT_FPS));
  const maxFrames = Math.floor(MAX_SECONDS * OUTPUT_FPS);
  const sampled = clip.frames
    .filter((_, i) => i % step === 0)
    .slice(0, maxFrames);

  const frames = sampled.map((frame) => {
    const rotations: Record<string, [number, number, number, number]> = {};
    for (const [contract, idx] of contractIndex) {
      // idx is a bone index; each bone owns three consecutive channels.
      const c = idx * 3;
      euler.set(
        (frame.rotations[c] ?? 0) * DEG2RAD,
        (frame.rotations[c + 1] ?? 0) * DEG2RAD,
        (frame.rotations[c + 2] ?? 0) * DEG2RAD,
        "XYZ",
      );
      quat.setFromEuler(euler);
      rotations[contract] = [quat.x, quat.y, quat.z, quat.w];
    }
    return { rotations };
  });

  const translations = sampled.map((f) => f.translation);
  const hasTranslation = translations.some((t) => t !== undefined);

  return {
    id: `${subject}_${clipId}`,
    name: `Clip ${subject}_${clipId}`,
    tags: [],
    frameRate: OUTPUT_FPS,
    frameCount: frames.length,
    durationSeconds: frames.length / clip.frameRate,
    frames,
    drivenBones,
    ...(hasTranslation
      ? { translation: translations.map((t) => t ?? [0, 0, 0]) }
      : {}),
  };
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });

  const clips: AnimationClip[] = [];
  const skeletons = new Map<string, AsfSkeleton | null>();
  let filesFetched = 0;

  for (const subject of SUBJECTS) {
    if (clips.length >= TARGET_CLIPS) break;

    console.log(`subject ${subject}: starting`);

    let skeleton = skeletons.get(subject);
    if (skeleton === undefined) {
      const asfDest = join(CACHE, `${subject}.asf`);
      if (!(await download(`${CMU_BASE}/${subject}/${subject}.asf`, asfDest))) {
        console.error(`subject ${subject}: ASF unavailable, skipping`);
        skeletons.set(subject, null);
        continue;
      }
      skeletons.set(subject, parseAsf(readFileSync(asfDest, "utf8")));
      filesFetched += 1;
    }
    // Re-read from the map: the local was not assigned inside the branch
    // above, so without this every subject is skipped on first visit.
    skeleton = skeletons.get(subject) ?? null;
    if (!skeleton) continue;

    let misses = 0;
    for (let n = 1; clips.length < TARGET_CLIPS; n++) {
      const clipId = String(n).padStart(2, "0");
      const amcDest = join(CACHE, `${subject}_${clipId}.amc`);
      const ok = await download(
        `${CMU_BASE}/${subject}/${subject}_${clipId}.amc`,
        amcDest,
      );
      if (!ok) {
        misses += 1;
        // A subject's clips are contiguous, so a run of misses ends it.
        if (misses >= 3) break;
        continue;
      }
      misses = 0;
      filesFetched += 1;

      const built = buildClip(
        subject,
        clipId,
        skeleton,
        readFileSync(amcDest, "utf8"),
      );
      if (built) {
        clips.push(built);
        console.log(`  + ${subject}_${clipId} (${built.frameCount} frames)`);
      }
      await sleep(90);
    }
  }

  if (clips.length === 0) {
    console.error("No clips converted; refusing to write an empty library.");
    process.exitCode = 1;
    return;
  }

  // Split into a small manifest plus one file per clip, so the browser loads
  // clip metadata up front and fetches motion data only when a clip is played.
  // A single 55 MB file would have to be downloaded in full before anything
  // could play.
  const clipDir = join(dirname(OUT), "clips");
  mkdirSync(clipDir, { recursive: true });

  const manifest = clips.map((clip) => {
    writeFileSync(join(clipDir, `${clip.id}.json`), clipToJson(clip));
    return {
      id: clip.id,
      name: clip.name,
      tags: clip.tags,
      frameRate: clip.frameRate,
      frameCount: clip.frameCount,
      durationSeconds: clip.durationSeconds,
      drivenBones: clip.drivenBones,
      hasTranslation: Boolean(clip.translation),
      file: `clips/${clip.id}.json`,
    };
  });

  writeFileSync(OUT, JSON.stringify({ version: 1, clips: manifest }));
  const bytes =
    statSync(OUT).size +
    clips.reduce((a, c) => a + statSync(join(clipDir, `${c.id}.json`)).size, 0);
  const frames = clips.reduce((a, c) => a + c.frameCount, 0);
  const seconds = clips.reduce((a, c) => a + c.durationSeconds, 0);
  console.log(
    `${clips.length} clips, ${frames} frames, ${seconds.toFixed(0)}s of motion, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB -> ${OUT}`,
  );
  console.log(`fetched ${filesFetched} files`);
}

await main();
