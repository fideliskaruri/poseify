// GENERATED FILE - DO NOT EDIT.
//
// Loads the generated scene library. Produced by `npm run scenes:generate`
// from tools/build-scene-library.ts.
//
// 220 validated scenes composed from theme x model x pose x prop layout,
// fetched on demand: the payload is large enough that inlining it would
// grow the main bundle for content most sessions never open.
//
// MIT-licensed: every scene is composed by this repo's own code from
// Poseify's own pose and prop libraries.

import type { SceneState } from "./Scene";

const URL_PATH = "/scenes/generated.json";

let cached: readonly SceneState[] | null = null;
let inFlight: Promise<readonly SceneState[]> | null = null;

/** Fetch the generated library, sharing one in-flight request. */
export async function loadGeneratedScenes(): Promise<readonly SceneState[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await fetch(URL_PATH);
    if (!response.ok) {
      throw new Error(
        `Could not load the generated scene library (${response.status}). ` +
          "Run \"npm run scenes:generate\" to rebuild it.",
      );
    }
    const payload = (await response.json()) as { scenes: SceneState[] };
    cached = payload.scenes;
    inFlight = null;
    return cached;
  })();
  return inFlight;
}

/** True once the library has been fetched. */
export function generatedScenesLoaded(): boolean {
  return cached !== null;
}

/** Reset the cache. Tests only. */
export function resetGeneratedSceneCache(): void {
  cached = null;
  inFlight = null;
}
