// Saving and loading scenes.
//
// Two destinations, no server: localStorage for quick work, and JSON files for
// anything worth keeping or sharing. Everything is stored as scene data, so a
// saved scene is portable and a loaded one can be edited like any other.

import {
  SCENE_FORMAT_VERSION,
  parseScene,
  sceneToJson,
  type SceneState,
  type SceneSummary,
} from "./Scene";

const KEY_PREFIX = "poseify.scene.";
const INDEX_KEY = "poseify.scenes";

function storage(): Storage | null {
  try {
    // Access can throw in private browsing modes, so guard it.
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function keyFor(name: string): string {
  return KEY_PREFIX + name;
}

/** Every saved scene's name and version, newest last. */
export function listSavedScenes(): SceneSummary[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SceneSummary =>
        !!s && typeof s.name === "string" && typeof s.version === "number",
    );
  } catch {
    return [];
  }
}

function writeIndex(names: string[], version = SCENE_FORMAT_VERSION): void {
  const store = storage();
  if (!store) return;
  const index: SceneSummary[] = names.map((name) => ({ name, version }));
  try {
    store.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Quota exceeded: the scene itself is already written, so a failed index
    // update should not throw and lose the save.
  }
}

/** Save a scene to localStorage, replacing any earlier scene of the same name. */
export function saveScene(scene: SceneState): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(keyFor(scene.name), sceneToJson(scene, false));
  } catch {
    return false;
  }
  const names = listSavedScenes().map((s) => s.name);
  if (!names.includes(scene.name)) names.push(scene.name);
  writeIndex(names);
  return true;
}

/** Load a saved scene by name, or null when it is missing or corrupt. */
export function loadScene(name: string): SceneState | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(keyFor(name));
  if (!raw) return null;
  return parseScene(raw);
}

export function deleteScene(name: string): boolean {
  const store = storage();
  if (!store) return false;
  store.removeItem(keyFor(name));
  writeIndex(
    listSavedScenes()
      .map((s) => s.name)
      .filter((n) => n !== name),
  );
  return true;
}

/**
 * Ask the browser to download a scene as a JSON file.
 * Returns false when there is no DOM to trigger the download.
 */
export function downloadScene(scene: SceneState): boolean {
  if (typeof document === "undefined") return false;
  const blob = new Blob([sceneToJson(scene)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${scene.name.replace(/[^a-z0-9._-]+/gi, "-")}.poseify.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** Parse a scene file's text, for drag-and-drop or a file input. */
export function readSceneFile(text: string): SceneState | null {
  return parseScene(text);
}

/** Whether a dropped or picked file looks like a Poseify scene. */
export function isSceneFile(file: { name?: string; type?: string }): boolean {
  if (file.type === "application/json") return true;
  return !!file.name?.endsWith(".json");
}
