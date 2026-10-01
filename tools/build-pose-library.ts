// Build the generated pose library.
//
// Runs the combinatorial generator, validates every candidate, and writes the
// survivors as JSON plus a small loader module.
//
// VALIDATION IS THE POINT. A generated pose that fails a check is dropped, not
// shipped: a broken pose is worse than a missing one, because the artist cannot
// tell it is broken.
//
// The payload is about 2 MB of quaternions, so it is written to public/ and
// fetched on first use rather than inlined, which would dominate the initial
// bundle.
//
// Usage:  npm run poses:generate

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMBINATION_COUNT,
  generatePoses,
} from "./generate-poses";
import { validateGeneratedPoses } from "./validate-poses";
import { anglesToPose } from "../src/pose/PoseAuthoring";
import type { Pose } from "../src/pose/Pose";
import { HAND_BONES } from "../src/rig/RigContract";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "poses");
const OUT_JSON = join(OUT_DIR, "generated.json");
const OUT_LOADER = join(ROOT, "src", "pose", "GeneratedPoseLibrary.ts");

/** How many generated poses to ship. The objective's floor is 1,000. */
const TARGET = Number(process.env.POSE_TARGET ?? 1200);

/**
 * A neutral standing rest pose in metres, used as the validation rig.
 *
 * The generator only produces rotations, so the rest pose is the same for every
 * candidate and only the rotated bones differ. These values describe a ~1.75 m
 * figure standing on a floor at Y = 0.
 */
function restPositions(): Map<string, { x: number; y: number; z: number }> {
  const m = new Map<string, { x: number; y: number; z: number }>();
  const put = (name: string, x: number, y: number, z: number): void => {
    m.set(name, { x, y, z });
  };
  put("Hips", 0, 0.95, 0);
  put("Spine", 0, 1.1, 0);
  put("Spine1", 0, 1.25, 0);
  put("Spine2", 0, 1.4, 0);
  put("Neck", 0, 1.55, 0);
  put("Head", 0, 1.68, 0);
  put("LeftShoulder", 0.04, 1.46, 0);
  put("RightShoulder", -0.04, 1.46, 0);
  put("LeftArm", 0.18, 1.46, 0);
  put("RightArm", -0.18, 1.46, 0);
  put("LeftForeArm", 0.5, 1.46, 0);
  put("RightForeArm", -0.5, 1.46, 0);
  put("LeftHand", 0.78, 1.46, 0);
  put("RightHand", -0.78, 1.46, 0);
  put("LeftUpLeg", 0.1, 0.9, 0);
  put("RightUpLeg", -0.1, 0.9, 0);
  put("LeftLeg", 0.1, 0.5, 0);
  put("RightLeg", -0.1, 0.5, 0);
  put("LeftFoot", 0.1, 0.06, 0);
  put("RightFoot", -0.1, 0.06, 0);
  put("LeftToeBase", 0.1, 0.02, 0.12);
  put("RightToeBase", -0.1, 0.02, 0.12);
  return m;
}

/**
 * Rest positions for the 40 finger bones, fanned out from the wrist.
 *
 * The generator never rotates a finger, so these exist only so a rotation of an
 * arm does not report a hand below the floor. Fanning them keeps the chain
 * finite and ordered rather than collapsed onto the wrist.
 */
function fingerRestPositions(
  wrists: Map<string, { x: number; y: number; z: number }>,
): Map<string, { x: number; y: number; z: number }> {
  const out = new Map<string, { x: number; y: number; z: number }>();
  let i = 0;
  for (const bone of HAND_BONES) {
    if (bone.endsWith("Hand")) continue;
    const side = bone.startsWith("Left") ? "Left" : "Right";
    const wrist = wrists.get(`${side}Hand`);
    if (!wrist) continue;
    const sign = side === "Left" ? 1 : -1;
    out.set(bone, {
      x: wrist.x + sign * 0.02 * (i % 4),
      y: wrist.y - 0.01 * (i % 3),
      z: wrist.z + 0.01 * Math.floor(i / 4),
    });
    i += 1;
  }
  return out;
}

/**
 * The loader module.
 *
 * Assembled from parts rather than one template literal so the nested backticks
 * in the fetch error message do not have to be escaped inside another literal.
 */
function loaderSource(count: number): string {
  return [
    "// GENERATED FILE - DO NOT EDIT.",
    "//",
    "// Loads the generated pose library. Produced by `npm run poses:generate`",
    "// from tools/build-pose-poses.ts. See tools/build-pose-library.ts.",
    "//",
    `// ${count} validated poses from ${COMBINATION_COUNT.toLocaleString()} axis`,
    "// combinations, fetched once on first use rather than inlined: the payload",
    "// is roughly 2 MB and would otherwise dominate the initial bundle.",
    "//",
    "// MIT-licensed: every pose is computed by this repo's own generator. No",
    "// third-party pose data is involved.",
    "",
    'import type { Pose } from "./Pose";',
    "",
    'const URL_PATH = "/poses/generated.json";',
    "",
    "let cached: readonly Pose[] | null = null;",
    "let inFlight: Promise<readonly Pose[]> | null = null;",
    "",
    "/**",
    " * Fetch the generated library, once.",
    " *",
    " * The in-flight promise is shared, so several callers mounting at the same",
    " * time issue one request rather than one each.",
    " */",
    "export async function loadGeneratedPoses(): Promise<readonly Pose[]> {",
    "  if (cached) return cached;",
    "  if (inFlight) return inFlight;",
    "  inFlight = (async () => {",
    "    const response = await fetch(URL_PATH);",
    "    if (!response.ok) {",
    "      throw new Error(",
    "        `Could not load the generated pose library (${response.status}). ` +",
    '          "Run \\"npm run poses:generate\\" to rebuild it.",',
    "      );",
    "    }",
    "    const payload = (await response.json()) as { poses: Pose[] };",
    "    cached = payload.poses;",
    "    inFlight = null;",
    "    return cached;",
    "  })();",
    "  return inFlight;",
    "}",
    "",
    "/** True once the library has been fetched, for tests and the picker. */",
    "export function generatedPosesLoaded(): boolean {",
    "  return cached !== null;",
    "}",
    "",
    "/** Reset the cache. Tests only. */",
    "export function resetGeneratedPoseCache(): void {",
    "  cached = null;",
    "  inFlight = null;",
    "}",
    "",
  ].join("\n");
}

function main(): void {
  const all = generatePoses();

  const rest = restPositions();
  for (const [k, v] of fingerRestPositions(rest)) rest.set(k, v);

  // The validator takes THREE.Vector3; a plain object with x/y/z is accepted
  // structurally so this build script needs no renderer.
  const context = { restPositions: rest as never, floorY: 0 };
  const { shipped, issues } = validateGeneratedPoses(all, context);

  const chosen = shipped.slice(0, TARGET);
  const trimmed = shipped.length - chosen.length;

  const poses: Pose[] = chosen.map((p) => ({
    id: p.id,
    name: p.name,
    tags: p.tags,
    bones: anglesToPose(p.angles),
    ...(p.rootOffset ? { rootOffset: p.rootOffset } : {}),
    source: "generated" as const,
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedBy: "npm run poses:generate (tools/generate-poses.ts)",
        validated: true,
        count: poses.length,
        poses,
      },
      null,
      0,
    ),
    "utf8",
  );
  writeFileSync(OUT_LOADER, loaderSource(poses.length), "utf8");

  const byReason = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.reason.split(" (")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }

  console.log(`combinations:  ${COMBINATION_COUNT}`);
  console.log(`generated:     ${all.length}`);
  console.log(`valid:         ${shipped.length}`);
  console.log(`rejected:      ${issues.length}`);
  console.log(
    `shipped:       ${poses.length}${trimmed > 0 ? `  (${trimmed} over target trimmed)` : ""}`,
  );
  if (byReason.size > 0) {
    console.log("rejection reasons:");
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${String(count).padStart(5)}  ${reason}`);
    }
  }
  console.log(`written:       ${OUT_JSON}`);
  console.log(`written:       ${OUT_LOADER}`);
}

main();


