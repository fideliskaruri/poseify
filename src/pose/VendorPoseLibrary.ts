// Optional pose library from the project CDN: rotations plus reference
// thumbnails under public/vendor/pose-my-art/ (gitignored), fetched by the
// asset tools. See ATTRIBUTION.md.
//
// WHY THIS IS LAZY
//
// The library is 5,170 files / 43 MB, so nothing is bundled and nothing is
// downloaded up front. The picker loads one small index (metadata only, so
// search and filtering work with no pose data resident), and fetches the
// ~8 KB rotation file for a pose only when the artist clicks it.
//
// The thumbnails need no rendering at all: each pose has a real reference
// image, so the picker shows that artwork rather than a re-render of our rig.
//
// BONE NAMES
//
// Vendor bones are namespaced Mixamo names (mixamorigHips) and are converted
// through the retargeter's own resolver, so a pose lands on exactly the joints
// the skeleton binder uses. Face and finger bones have no contract equivalent
// and are dropped rather than guessed at.

import * as THREE from "three";
import { resolveContractBoneName } from "../rig/Retargeter";
import type { PoseData } from "../posing/PosableSkeleton";
import type { Pose } from "./Pose";

export const VENDOR_POSE_BASE = "/vendor/pose-my-art/extracted_poses";
export const VENDOR_POSE_THUMB_BASE =
  "/vendor/pose-my-art/extracted_poses_imgs";
export const VENDOR_POSE_INDEX_URL = `${VENDOR_POSE_BASE}/index.json`;

/** Root that the index's stored paths are relative to. */
const VENDOR_ROOT = "/vendor/pose-my-art";

/**
 * Resolve an index path to a servable URL.
 *
 * The index stores paths relative to the vendor *root*
 * (`extracted_poses/75_0.pose.pma`), not to the directory the index itself
 * lives in, so this prepends the root. Getting that wrong asks the dev server
 * for a path that does not exist, and the SPA fallback answers with
 * index.html -- which surfaces as a JSON parse error rather than a clean 404.
 */
function vendorUrl(relative: string): string {
  return (
    VENDOR_ROOT + "/" + relative.split("/").map(encodeURIComponent).join("/")
  );
}

/**
 * One row of the index: everything the picker needs to show and search a pose
 * without holding any of its rotation data.
 */
export interface VendorPoseSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  /** How many bones the authored pose touches. */
  bones: number;
  /** Path relative to the vendor root, e.g. `extracted_poses/75_0.pose.pma`. */
  data: string;
  /** Same for the thumbnail, or null when it was not public. */
  thumb: string | null;
}

interface VendorBone {
  rotation?: { x?: number; y?: number; z?: number };
}

// --- the index -------------------------------------------------------------

let indexPromise: Promise<VendorPoseSummary[]> | null = null;

/**
 * Load the pose index once and cache it.
 *
 * A failure clears the cached promise so a later attempt can retry, rather
 * than pinning a rejection for the life of the page.
 */
export function loadVendorPoseIndex(): Promise<VendorPoseSummary[]> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const res = await fetch(VENDOR_POSE_INDEX_URL);
    if (!res.ok) {
      throw new Error(`Pose index unavailable: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { poses?: VendorPoseSummary[] };
    return data.poses ?? [];
  })().catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

/** Split a row's comma-separated category into clean lowercase tags. */
function tagsOf(summary: VendorPoseSummary): string[] {
  const tags = new Set<string>();
  for (const raw of summary.category.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (tag) tags.add(tag);
  }
  return [...tags];
}

/**
 * Filter the index by free-text query and an optional category tag.
 *
 * Description is included in the haystack because the vendor names are terse
 * and machine-generated ("female_action_poses8") while the description is the
 * only place the actual subject is written out.
 */
export function searchVendorPoses(
  poses: readonly VendorPoseSummary[],
  query: string,
  category?: string,
  limit = Number.POSITIVE_INFINITY,
): VendorPoseSummary[] {
  const q = query.trim().toLowerCase();
  const out: VendorPoseSummary[] = [];
  for (const pose of poses) {
    if (category && !tagsOf(pose).includes(category.toLowerCase())) continue;
    if (q) {
      const hay =
        `${pose.name} ${pose.category} ${pose.description} ${pose.id}`.toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t))) continue;
    }
    out.push(pose);
    if (out.length >= limit) break;
  }
  return out;
}

/** Every distinct tag in the index, with counts, for the category filter. */
export function vendorPoseCategories(
  poses: readonly VendorPoseSummary[],
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pose of poses) {
    for (const tag of tagsOf(pose)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// --- loading one pose ------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Convert a decoded vendor pose payload into PoseData.
 *
 * The payload is `{ bones: [ { <boneName>: { rotation: {x,y,z} } } ] }` -- the
 * map is wrapped in a single-element array and the rotations are Euler radians
 * in XYZ order, which is the same authored local rotation PosableSkeleton
 * stores as a quaternion. No bind-pose compensation belongs here:
 * setBoneRotation already composes onto each bone's bind orientation.
 */
export function vendorBonesToPoseData(raw: unknown): PoseData {
  const pose: PoseData = {};
  const source = raw as { bones?: Array<Record<string, VendorBone>> } | null;
  const entries = source?.bones;
  if (!Array.isArray(entries) || entries.length === 0) return pose;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    for (const [boneName, data] of Object.entries(entry)) {
      if (!data || typeof data !== "object") continue;
      const contract = resolveContractBoneName(boneName);
      if (!contract) continue;
      const r = data.rotation;
      if (!r) continue;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(num(r.x), num(r.y), num(r.z), "XYZ"),
      );
      // A bone at identity carries no information; writing it would fight the
      // bind pose on models whose rest orientation differs from the vendor's.
      if (
        Math.abs(q.x) < 1e-6 &&
        Math.abs(q.y) < 1e-6 &&
        Math.abs(q.z) < 1e-6 &&
        Math.abs(q.w - 1) < 1e-6
      ) {
        continue;
      }
      pose[contract] = [q.x, q.y, q.z, q.w];
    }
  }
  return pose;
}

/** Cache of already-loaded poses, so re-applying one costs nothing. */
const poseCache = new Map<string, Pose>();

/** Fetch and convert one vendor pose. Cached after the first load. */
export async function loadVendorPose(
  summary: VendorPoseSummary,
): Promise<Pose> {
  const cached = poseCache.get(summary.id);
  if (cached) return cached;

  const res = await fetch(vendorUrl(summary.data));
  if (!res.ok) {
    throw new Error(`Could not load pose "${summary.name}": HTTP ${res.status}`);
  }
  const pose: Pose = {
    id: summary.id,
    name: summary.name,
    tags: tagsOf(summary),
    bones: vendorBonesToPoseData(await res.json()),
    source: "imported",
  };
  poseCache.set(summary.id, pose);
  return pose;
}

/**
 * The vendor's own reference image for a pose, or null when it is missing.
 *
 * Used directly as an <img> src rather than being rendered: it is the artwork
 * the pose was authored against.
 */
export function vendorPoseThumb(summary: VendorPoseSummary): string | null {
  if (!summary.thumb) return null;
  return vendorUrl(summary.thumb);
}
