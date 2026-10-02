// Scene state: everything needed to reconstruct a setup.
//
// A scene is pure data with no three.js objects in it, so it serialises
// cleanly, round trips through JSON, and can be stored in localStorage or
// shipped as a file. Quaternions are stored rather than Euler angles so a
// reloaded scene produces exactly the same pose.

import type { PoseData } from "../posing/PosableSkeleton";
import type { GridState, LightState } from "./SceneEnvironment";

export const SCENE_FORMAT_VERSION = 1;

// Per-object transform, kept apart from the pose record. The pose is joint
// rotations; this is where the whole figure sits in the world. Phase 1 moved
// scale from a bare number to a full vec3 so a figure can be stretched, and
// added the object-level flags PoseMy.Art exposes as Show/Lock/Color.
export interface ObjectTransform {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

// Object-level presentation and edit state. These belong with the object, not
// the pose: hiding a figure must survive save/load without touching its bones.
export interface ObjectState {
  hidden?: boolean;
  locked?: boolean;
  // Hex colour applied to the model's materials, or undefined for the
  // material's own colour.
  color?: string;
}

export interface SceneModel {
  // Catalogue id of the model, so a reload can find the asset again.
  id: string;
  pose: PoseData;
  // Root drop in metres, for seated and kneeling poses.
  rootOffset?: [number, number, number];
  transform: ObjectTransform;
  state?: ObjectState;
}

export interface SceneProp {
  // Catalogue id for built-in props, or null for an imported asset.
  id: string | null;
  name?: string;
  transform: ObjectTransform;
  state?: ObjectState;
  // URL for an imported asset; built-in props omit this.
  path?: string;
  /**
   * Joint this prop is pinned to, or undefined when it stands on its own.
   *
   * Mirrors PoseMy.Art's `propAttachInfo`. Stored by bone name rather than by
   * a bone reference so the record is plain JSON: a saved scene has no live
   * skeleton to point at.
   */
  attach?: PropAttach;
}

/** A prop pinned to a joint, with its offset in that bone's local space. */
export interface PropAttach {
  bone: string;
  offset: [number, number, number];
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
 * Read a transform from either the v2 shape (nested `transform`) or the v1
 * shape (flat `position`/`rotation`/`scale` fields).
 *
 * v1 stored models with a scalar `scale` and props with a vec3. Both are
 * accepted here so a scene saved by an earlier build still opens, which
 * matters because scenes live in localStorage and in hand-shared files.
 */
function objectTransform(
  raw: unknown,
  legacyScale: [number, number, number],
): ObjectTransform {
  const outer = (raw ?? {}) as Partial<ObjectTransform> & {
    position?: unknown;
    rotation?: unknown;
    scale?: unknown;
  };
  // v2 nests the transform; v1 kept position/rotation/scale flat on the
  // object. Prefer the nested form and fall back to the flat one, so scenes
  // saved by either build open.
  const source = (
    outer.transform ?? outer
  ) as Partial<ObjectTransform> & { scale?: unknown };
  // A v1 model wrote a bare number; v1 props and v2 both write a vec3.
  const scale = isFiniteNumber(source.scale)
    ? [source.scale, source.scale, source.scale]
    : vec3(source.scale, legacyScale);

  return {
    position: vec3(source.position, [0, 0, 0]),
    rotation: quat(source.rotation, [0, 0, 0, 1]),
    scale: vec3(scale, [1, 1, 1]),
  };
}

function objectState(raw: unknown): ObjectState | undefined {
  const source = (raw ?? {}) as Partial<ObjectState>;
  const state: ObjectState = {};
  if (source.hidden === true) state.hidden = true;
  if (source.locked === true) state.locked = true;
  if (typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color)) {
    state.color = source.color.toLowerCase();
  }
  return Object.keys(state).length > 0 ? state : undefined;
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
      const model: SceneModel = {
        id: m.id,
        pose: m.pose && typeof m.pose === "object" ? (m.pose as PoseData) : {},
        rootOffset:
          Array.isArray(m.rootOffset) && m.rootOffset.length === 3
            ? vec3(m.rootOffset, [0, 0, 0])
            : undefined,
        transform: objectTransform(m, [1, 1, 1]),
      };
      const state = objectState(m.state);
      if (state) model.state = state;
      models.push(model);
    }

    const props: SceneProp[] = [];
    for (const p of raw.props ?? []) {
      if (!p) continue;
      const prop: SceneProp = {
        id: typeof p.id === "string" ? p.id : null,
        name: typeof p.name === "string" ? p.name : undefined,
        transform: objectTransform(p, [1, 1, 1]),
        path: typeof p.path === "string" ? p.path : undefined,
      };
      const state = objectState(p.state);
      if (state) prop.state = state;
      // Only accept a well-formed attach record. A scene naming a bone this
      // model does not have is still loaded; the attach is simply dropped and
      // the prop stands free, which is recoverable and better than refusing
      // the whole scene.
      const attach = p.attach as Partial<PropAttach> | undefined;
      if (
        attach &&
        typeof attach.bone === "string" &&
        Array.isArray(attach.offset) &&
        attach.offset.length === 3 &&
        attach.offset.every(isFiniteNumber)
      ) {
        prop.attach = {
          bone: attach.bone,
          offset: [
            attach.offset[0] as number,
            attach.offset[1] as number,
            attach.offset[2] as number,
          ],
        };
      }
      props.push(prop);
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
