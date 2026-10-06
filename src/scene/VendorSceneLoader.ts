// Load a premade scene from the project CDN and convert it into Poseify's own
// scene format. Scene files under /vendor/pose-my-art/scenes/ are gitignored
// and fetched by the asset tools. See ATTRIBUTION.md.
//
// The two formats have nothing in common, so this is a real translation rather
// than a field copy:
//
//   vendor .pma                        Poseify SceneState
//   -------------------------------    ------------------------------------
//   units: centimetres                  units: metres            (/ 100)
//   rotations: Euler radians per bone   PoseData: quaternions    (x,y,z,w)
//   bones: "mixamorigHips" etc.        contract names: "Hips"    (retargeter)
//   model id: 60 (numeric)             model id: "bot_x_fixed"   (SCENE_MODEL_MAP)
//   prop id:  162 (numeric)            prop id:  "v162"          (VendorPropCatalog)
//   object rotation: Euler radians     object rotation: quaternion
//   camera: orbitControls + FOV        camera: position + target + fov
//
// The bone rotation is the part that has to be exactly right. A vendor pose is
// an *authored local rotation* in Euler order, which is the same quantity
// PosableSkeleton stores as a quaternion, so the conversion is a straight
// Euler->quaternion with no bind-pose compensation: setBoneRotation already
// composes on top of each bone's bind orientation.

import * as THREE from "three";
import { resolveContractBoneName } from "../rig/Retargeter";
import { findProp } from "../props/PropCatalog";
import { sceneModelPoseifyId } from "./SceneModelMap";
import {
  SCENE_FORMAT_VERSION,
  emptyScene,
  type SceneModel,
  type SceneProp,
  type SceneState,
} from "./Scene";
import type { PoseData } from "../posing/PosableSkeleton";

export const VENDOR_SCENE_BASE = "/vendor/pose-my-art/scenes";

/** Vendor world units are centimetres; Poseify works in metres. */
const CM_TO_M = 0.01;

// --- the vendor payload, as far as we care about it -----------------------

interface VendorBone {
  rotation?: { x?: number; y?: number; z?: number };
}

interface VendorObject {
  name?: string;
  isModel?: boolean;
  isProp?: boolean;
  isCustomProp?: boolean;
  isLight?: boolean;
  isImage?: boolean;
  isDeleted?: boolean;
  isHidden?: boolean;
  modelOrPropID?: number | null;
  bones?: VendorBone[] | null;
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  scale?: { x?: number; y?: number; z?: number };
}

interface VendorScene {
  sceneObjects?: Record<string, VendorObject>;
  orbitControls?: {
    position?: { x?: number; y?: number; z?: number };
    target?: { x?: number; y?: number; z?: number };
  };
  FOV?: number;
}

export interface VendorSceneSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  /** CDN filename, e.g. `sword_fight_jump_attack_fixed.pma` */
  file: string;
}

// --- the search index ------------------------------------------------------

export const VENDOR_SCENE_INDEX_URL = `${VENDOR_SCENE_BASE}/index.json`;

let indexPromise: Promise<VendorSceneSummary[]> | null = null;

/**
 * Load the premade-scene index once and cache it.
 *
 * The index is ~1 MB, so it is fetched on first use rather than bundled. A
 * failure is cached as a rejection too, so a missing vendor directory does not
 * re-request on every keystroke in the picker.
 */
export function loadVendorSceneIndex(): Promise<VendorSceneSummary[]> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const res = await fetch(VENDOR_SCENE_INDEX_URL);
    if (!res.ok) {
      throw new Error(`Scene index unavailable: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      scenes?: VendorSceneSummary[];
    };
    return data.scenes ?? [];
  })().catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

/**
 * Filter the scene index by a free-text query and an optional category.
 *
 * Matches name, category and description, because the vendor names are terse
 * ("anime_kissing_poses7") while the description is the only place the actual
 * subject is written out.
 */
export function searchVendorScenes(
  scenes: readonly VendorSceneSummary[],
  query: string,
  category?: string,
): VendorSceneSummary[] {
  const q = query.trim().toLowerCase();
  let out = scenes;
  if (category) {
    out = out.filter((s) => s.category.split(",").includes(category));
  }
  if (!q) return [...out];
  const terms = q.split(/\s+/);
  return out.filter((s) => {
    const hay =
      `${s.name} ${s.category} ${s.description} ${s.file}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Every distinct tag in the index, with counts, for the category filter. */
export function vendorSceneCategories(
  scenes: readonly VendorSceneSummary[],
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of scenes) {
    for (const tag of s.category.split(",")) {
      const t = tag.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// --- helpers ---------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function vec3(
  v: { x?: number; y?: number; z?: number } | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (!v) return fallback;
  return [num(v.x, fallback[0]), num(v.y, fallback[1]), num(v.z, fallback[2])];
}

/**
 * The six "Basic Shapes" props (ids 1-6) are the only vendor prop FBX that are
 * not public -- they return HTTP 403. Poseify already ships each of them as a
 * built-in primitive, so a scene that drops a Cube should still get a cube.
 * Mapping them here turns ~850 otherwise-skipped prop instances back into
 * visible geometry.
 */
const BASIC_SHAPE_ALIAS: Record<number, string> = {
  1: "crate", // Cube
  2: "cone",
  3: "cylinder",
  4: "ball", // Dodecahedron
  5: "ball", // Sphere
  6: "plane", // Torus
};

/** Euler radians (vendor XYZ order) -> quaternion tuple. */
function eulerToQuat(
  e: { x?: number; y?: number; z?: number } | undefined,
): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(num(e?.x), num(e?.y), num(e?.z), "XYZ"),
  );
  return [q.x, q.y, q.z, q.w];
}

/**
 * Convert a vendor bone map into Poseify's PoseData.
 *
 * The vendor payload wraps the map in a single-element array
 * (`bones: [{...}]`) and keys bones with their namespaced source names. Bone
 * names go through the retargeter's own resolver, so a scene's pose lands on
 * exactly the joints the skeleton retargeter bound -- face and finger bones
 * that have no contract equivalent are dropped rather than guessed at.
 */
function vendorBonesToPose(bones: VendorBone[] | null | undefined): PoseData {
  const pose: PoseData = {};
  if (!Array.isArray(bones) || bones.length === 0) return pose;
  for (const entry of bones) {
    if (!entry || typeof entry !== "object") continue;
    for (const [sourceName, data] of Object.entries(
      entry as Record<string, VendorBone>,
    )) {
      if (!data || typeof data !== "object") continue;
      const contract = resolveContractBoneName(sourceName);
      if (!contract) continue;
      const [x, y, z, w] = eulerToQuat(data.rotation);
      // A bone with an identity rotation carries no information, and writing
      // it would fight the bind pose on models whose rest orientation differs.
      const identityish =
        Math.abs(x) < 1e-6 &&
        Math.abs(y) < 1e-6 &&
        Math.abs(z) < 1e-6 &&
        Math.abs(w - 1) < 1e-6;
      if (identityish) continue;
      pose[contract] = [x, y, z, w];
    }
  }
  return pose;
}

// --- conversion ------------------------------------------------------------

export interface VendorSceneConversion {
  scene: SceneState;
  /** Objects that could not be represented, with the reason. */
  skipped: string[];
}

/**
 * Convert a decoded vendor scene into Poseify's format.
 *
 * `name` is used for the scene title because the vendor file itself carries no
 * name -- that lives in the catalogue row.
 */
export function convertVendorScene(
  raw: unknown,
  name: string,
): VendorSceneConversion {
  const skipped: string[] = [];
  const scene = emptyScene(name);
  scene.version = SCENE_FORMAT_VERSION;

  const src = raw as VendorScene | null;
  const objects = Object.values(src?.sceneObjects ?? {});
  // Deleted objects are how the vendor app models "removed but remembered";
  // a restored scene must not resurrect them.
  const live = objects.filter((o) => o && !o.isDeleted);

  for (const obj of live) {
    if (obj.isLight || obj.isImage) continue;

    const id = obj.modelOrPropID;

    if (obj.isModel) {
      if (id === null || id === undefined) {
        skipped.push(`model "${obj.name ?? "?"}" has no id`);
        continue;
      }
      const poseifyId = sceneModelPoseifyId(id);
      if (!poseifyId) {
        skipped.push(`model id ${id} (${obj.name ?? "?"}) has no Poseify model`);
        continue;
      }
      const model: SceneModel = {
        id: poseifyId,
        pose: vendorBonesToPose(obj.bones),
        position: vec3(obj.position, [0, 0, 0]).map(
          (n) => n * CM_TO_M,
        ) as [number, number, number],
        rotation: eulerToQuat(obj.rotation),
        scale: 1,
      };
      // The vendor stores a per-object scale. Poseify's SceneModel carries a
      // uniform one, so a non-uniform figure scale is reported rather than
      // silently mangled into something that distorts the mesh.
      const s = obj.scale;
      if (s) {
        const [sx, sy, sz] = [num(s.x, 1), num(s.y, 1), num(s.z, 1)];
        const spread = Math.max(sx, sy, sz) - Math.min(sx, sy, sz);
        if (spread > 1e-3) {
          skipped.push(
            `model "${obj.name ?? poseifyId}" has non-uniform scale ` +
              `(${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)}), ` +
              `applied as uniform`,
          );
        }
        model.scale = sx;
      }
      scene.models.push(model);
      continue;
    }

    if (obj.isProp || obj.isCustomProp) {
      if (id === null || id === undefined) {
        skipped.push(`prop "${obj.name ?? "?"}" has no id`);
        continue;
      }
      // Vendor prop ids are numeric; the generated prop catalogue namespaces
      // them as `v<id>` so they cannot collide with the built-in props. The six
      // basic shapes are 403 on the CDN and fall back to a built-in primitive.
      const propId = BASIC_SHAPE_ALIAS[id] ?? `v${id}`;
      if (!findProp(propId)) {
        // A prop whose FBX 403'd, or one the app no longer lists. The scene
        // still loads without it rather than failing whole.
        skipped.push(`prop id ${id} (${obj.name ?? "?"}) is not in the catalogue`);
        continue;
      }
      const scale = obj.scale;
      const prop: SceneProp = {
        id: propId,
        name: obj.name,
        position: vec3(obj.position, [0, 0, 0]).map(
          (n) => n * CM_TO_M,
        ) as [number, number, number],
        rotation: eulerToQuat(obj.rotation),
        scale: scale
          ? [num(scale.x, 1), num(scale.y, 1), num(scale.z, 1)]
          : [1, 1, 1],
      };
      scene.props.push(prop);
      continue;
    }
  }

  // Camera. The vendor stores the orbit camera rather than a free camera, so
  // the position/target pair maps straight onto Poseify's orbit camera.
  const orbit = src?.orbitControls;
  if (orbit) {
    scene.camera.position = vec3(
      orbit.position,
      scene.camera.position,
    ).map((n) => n * CM_TO_M) as [number, number, number];
    scene.camera.target = vec3(orbit.target, scene.camera.target).map(
      (n) => n * CM_TO_M,
    ) as [number, number, number];
  }
  if (typeof src?.FOV === "number" && Number.isFinite(src.FOV)) {
    scene.camera.fov = src.FOV;
  }

  return { scene, skipped };
}

/**
 * Fetch and convert one vendor scene by its catalogue filename.
 */
export async function loadVendorScene(
  file: string,
  name: string,
): Promise<VendorSceneConversion> {
  const url =
    VENDOR_SCENE_BASE + "/" + file.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Scene "${name}" failed to load: HTTP ${res.status}`);
  }
  return convertVendorScene(await res.json(), name);
}
