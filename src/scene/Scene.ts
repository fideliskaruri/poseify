// Scene state: everything needed to reconstruct a setup.
//
// A scene is pure data with no three.js objects in it, so it serialises
// cleanly, round trips through JSON, and can be stored in localStorage or
// shipped as a file. Quaternions are stored rather than Euler angles so a
// reloaded scene produces exactly the same pose.

import type { PoseData } from "../posing/PosableSkeleton";
import type { GridState, LightState } from "./SceneEnvironment";

export const SCENE_FORMAT_VERSION = 1;

export interface SceneModel {
  // Catalogue id of the model, so a reload can find the asset again.
  id: string;
  pose: PoseData;
  // Root drop in metres, for seated and kneeling poses.
  rootOffset?: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: number;
}

export interface SceneProp {
  // Catalogue id for built-in props, or null for an imported asset.
  id: string | null;
  name?: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  // URL for an imported asset; built-in props omit this.
  path?: string;
}

export interface SceneCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface SceneState {
  version: number;
  name: string;
  models: SceneModel[];
  props: SceneProp[];
  camera: SceneCamera;
  light: LightState;
  grid: GridState;
}

export interface SceneSummary {
  name: string;
  version: number;
  savedAt?: string;
}

/** Build an empty scene with sane defaults. */
export function emptyScene(name = "Untitled"): SceneState {
  return {
    version: SCENE_FORMAT_VERSION,
    name,
    models: [],
    props: [],
    camera: {
      position: [2.4, 2, 3.2],
      target: [0, 0.9, 0],
      fov: 50,
    },
    light: {
      azimuth: 40,
      elevation: 55,
      intensity: 2.4,
      distance: 9,
      castShadows: true,
    },
    grid: { visible: true, cellSize: 1, divisions: 40, opacity: 0.55 },
  };
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function vec3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3 && value.every(isFiniteNumber)) {
    return [value[0], value[1], value[2]];
  }
  return fallback;
}

function quat(
  value: unknown,
  fallback: [number, number, number, number],
): [number, number, number, number] {
  if (Array.isArray(value) && value.length >= 4 && value.every(isFiniteNumber)) {
    return [value[0], value[1], value[2], value[3]];
  }
  return fallback;
}

/**
 * Parse scene JSON, repairing anything malformed rather than throwing.
 *
 * Scene files are hand-editable and arrive from downloads, so a partially
 * broken file should still open with whatever is valid instead of failing
 * outright.
 */
export function parseScene(text: string): SceneState | null {
  try {
    const raw = JSON.parse(text) as Partial<SceneState>;
    if (!raw || typeof raw !== "object") return null;
    if (!Array.isArray(raw.models)) return null;

    const base = emptyScene(
      typeof raw.name === "string" && raw.name ? raw.name : "Untitled",
    );

    const models: SceneModel[] = [];
    for (const m of raw.models) {
      if (!m || typeof m.id !== "string") continue;
      models.push({
        id: m.id,
        pose: m.pose && typeof m.pose === "object" ? (m.pose as PoseData) : {},
        rootOffset:
          Array.isArray(m.rootOffset) && m.rootOffset.length === 3
            ? vec3(m.rootOffset, [0, 0, 0])
            : undefined,
        position: vec3(m.position, [0, 0, 0]),
        rotation: quat(m.rotation, [0, 0, 0, 1]),
        scale: isFiniteNumber(m.scale) && m.scale !== 0 ? m.scale : 1,
      });
    }

    const props: SceneProp[] = [];
    for (const p of raw.props ?? []) {
      if (!p) continue;
      props.push({
        id: typeof p.id === "string" ? p.id : null,
        name: typeof p.name === "string" ? p.name : undefined,
        position: vec3(p.position, [0, 0, 0]),
        rotation: quat(p.rotation, [0, 0, 0, 1]),
        scale: vec3(p.scale, [1, 1, 1]),
        path: typeof p.path === "string" ? p.path : undefined,
      });
    }

    const cam = raw.camera as SceneCamera | undefined;
    const camera: SceneCamera = {
      position: vec3(cam?.position, base.camera.position),
      target: vec3(cam?.target, base.camera.target),
      fov: isFiniteNumber(cam?.fov) ? cam!.fov : base.camera.fov,
    };

    return {
      version: SCENE_FORMAT_VERSION,
      name: base.name,
      models,
      props,
      camera,
      light: { ...base.light, ...(raw.light ?? {}) },
      grid: { ...base.grid, ...(raw.grid ?? {}) },
    };
  } catch {
    return null;
  }
}

export function sceneToJson(scene: SceneState, pretty = true): string {
  return JSON.stringify(scene, null, pretty ? 2 : 0);
}
