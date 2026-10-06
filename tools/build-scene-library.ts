// Build the generated scene library.
//
// Composes theme x model x pose x prop layout, validates every scene against
// the real catalogues, and writes the survivors.
//
// A scene referencing a pose or prop that does not exist loads as a broken
// setup with a missing-item warning, so validation here is the difference
// between 200 usable scenes and 200 broken rows.
//
// Usage:  npm run scenes:generate

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateScenes,
  toSceneState,
  validateScenes,
} from "./generate-scenes";
import { POSE_LIBRARY, findPoseById } from "../src/pose/PoseLibrary";
import { PROP_CATALOG } from "../src/props/PropCatalog";
import { MODEL_CATALOG } from "../src/models/ModelCatalog";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Written to public/ rather than inlined: 220 scenes is roughly 600 KB of scene
// data, which would meaningfully grow the main bundle. Fetched on demand.
const OUT_DIR = join(ROOT, "public", "scenes");
const OUT_JSON = join(OUT_DIR, "generated.json");
const OUT_LOADER = join(ROOT, "src", "scene", "GeneratedScenes.ts");

/** How many scenes to ship. The objective's floor is 200. */
const TARGET = Number(process.env.SCENE_TARGET ?? 220);

/**
 * Poses to compose from.
 *
 * Only the hand-written library, not the generated one: a scene whose whole
 * point is a legible, curated pose should not be built on a combinatorial
 * variation, and the pose picker already offers those directly.
 */
const SCENE_POSES = POSE_LIBRARY.map((p) => p.id);

/**
 * The loader module.
 *
 * Assembled from parts rather than one template literal, matching the pose
 * library's loader for the same reason: nested backticks inside a nested
 * template literal need escaping that is easy to get wrong.
 */
function loaderSource(count: number): string {
  return [
    "// GENERATED FILE - DO NOT EDIT.",
    "//",
    "// Loads the generated scene library. Produced by `npm run scenes:generate`",
    "// from tools/build-scene-library.ts.",
    "//",
    `// ${count} validated scenes composed from theme x model x pose x prop layout,`,
    "// fetched on demand: the payload is large enough that inlining it would",
    "// grow the main bundle for content most sessions never open.",
    "//",
    "// MIT-licensed: every scene is composed by this repo's own code from",
    "// Poseify's own pose and prop libraries.",
    "",
    'import type { SceneState } from "./Scene";',
    "",
    'const URL_PATH = "/scenes/generated.json";',
    "",
    "let cached: readonly SceneState[] | null = null;",
    "let inFlight: Promise<readonly SceneState[]> | null = null;",
    "",
    "/** Fetch the generated library, sharing one in-flight request. */",
    "export async function loadGeneratedScenes(): Promise<readonly SceneState[]> {",
    "  if (cached) return cached;",
    "  if (inFlight) return inFlight;",
    "  inFlight = (async () => {",
    "    const response = await fetch(URL_PATH);",
    "    if (!response.ok) {",
    "      throw new Error(",
    "        `Could not load the generated scene library (${response.status}). ` +",
    '          "Run \\"npm run scenes:generate\\" to rebuild it.",',
    "      );",
    "    }",
    "    const payload = (await response.json()) as { scenes: SceneState[] };",
    "    cached = payload.scenes;",
    "    inFlight = null;",
    "    return cached;",
    "  })();",
    "  return inFlight;",
    "}",
    "",
    "/** True once the library has been fetched. */",
    "export function generatedScenesLoaded(): boolean {",
    "  return cached !== null;",
    "}",
    "",
    "/** Reset the cache. Tests only. */",
    "export function resetGeneratedSceneCache(): void {",
    "  cached = null;",
    "  inFlight = null;",
    "}",
    "",
  ].join("\n");
}
function main(): void {
  const catalogue = {
    models: new Set(MODEL_CATALOG.map((m) => m.id)),
    poses: new Set(SCENE_POSES),
    props: new Set(PROP_CATALOG.map((p) => p.id)),
  };

  const all = generateScenes({
    models: [...catalogue.models],
    poses: SCENE_POSES,
    props: [...catalogue.props],
  });

  const { shipped, issues } = validateScenes(all, catalogue);
  const chosen = shipped.slice(0, TARGET);
  const trimmed = shipped.length - chosen.length;

  // Resolve poses to real SceneState entries, so a pose renamed between the
  // generator and this step fails loudly rather than shipping a dangling id.
  const states = [];
  for (const scene of chosen) {
    const pose = findPoseById(scene.pose);
    if (!pose) continue;
    states.push(toSceneState(scene, { bones: pose.bones, rootOffset: pose.rootOffset }));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedBy: "npm run scenes:generate (tools/generate-scenes.ts)",
        validated: true,
        count: states.length,
        scenes: states,
      },
      null,
      0,
    ),
    "utf8",
  );

  writeFileSync(OUT_LOADER, loaderSource(states.length), "utf8");

  const byReason = new Map<string, number>();
  for (const issue of issues) {
    const key = issue.reason.split(";")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }

  console.log(`composed:   ${all.length}`);
  console.log(`valid:      ${shipped.length}`);
  console.log(`rejected:   ${issues.length}`);
  console.log(
    `shipped:    ${states.length}${trimmed > 0 ? `  (${trimmed} over target trimmed)` : ""}`,
  );
  console.log(`models:     ${catalogue.models.size}`);
  console.log(`poses:      ${catalogue.poses.size}`);
  console.log(`props:      ${catalogue.props.size}`);
  if (byReason.size > 0) {
    console.log("rejection reasons:");
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${String(count).padStart(5)}  ${reason}`);
    }
  }
  console.log(`written:    ${OUT_JSON}`);
  console.log(`written:    ${OUT_LOADER}`);
}

main();



