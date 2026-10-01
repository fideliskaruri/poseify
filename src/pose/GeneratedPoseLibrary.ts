// GENERATED FILE - DO NOT EDIT.
//
// Loads the generated pose library. Produced by `npm run poses:generate`
// from tools/build-pose-poses.ts. See tools/build-pose-library.ts.
//
// 1200 validated poses from 10,368 axis
// combinations, fetched once on first use rather than inlined: the payload
// is roughly 2 MB and would otherwise dominate the initial bundle.
//
// MIT-licensed: every pose is computed by this repo's own generator. No
// third-party pose data is involved.

import type { Pose } from "./Pose";

const URL_PATH = "/poses/generated.json";

let cached: readonly Pose[] | null = null;
let inFlight: Promise<readonly Pose[]> | null = null;

/**
 * Fetch the generated library, once.
 *
 * The in-flight promise is shared, so several callers mounting at the same
 * time issue one request rather than one each.
 */
export async function loadGeneratedPoses(): Promise<readonly Pose[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await fetch(URL_PATH);
    if (!response.ok) {
      throw new Error(
        `Could not load the generated pose library (${response.status}). ` +
          "Run \"npm run poses:generate\" to rebuild it.",
      );
    }
    const payload = (await response.json()) as { poses: Pose[] };
    cached = payload.poses;
    inFlight = null;
    return cached;
  })();
  return inFlight;
}

/** True once the library has been fetched, for tests and the picker. */
export function generatedPosesLoaded(): boolean {
  return cached !== null;
}

/** Reset the cache. Tests only. */
export function resetGeneratedPoseCache(): void {
  cached = null;
  inFlight = null;
}
