// Offscreen thumbnail rendering for the model picker.
//
// Each model is rendered once to a small PNG data URL and cached. Models are
// real FBX files on disk, so a thumbnail means loading the FBX, framing its
// bounds and rasterising it -- which is inherently async. Nothing is fetched
// until the picker is actually opened.
//
// Failure is never fatal: no WebGL, a failed fetch, or an unreadable file all
// resolve to null and the picker falls back to its text-only tile.

import * as THREE from "three";
import { loadModelFromURL } from "./ModelLoader";
import type { CatalogEntry } from "./ModelCatalog";

const THUMB_SIZE = 128;

// Resolved values live here so re-renders are free. A pending promise is also
// stored, so two callers asking for the same model at once share one fetch.
const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let unavailable = false;

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (unavailable) return null;
  if (renderer) return renderer;
  if (typeof document === "undefined") return null;

  // Offscreen canvas keeps thumbnails out of the document flow.
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    // No WebGL (headless / blocked): the picker falls back to text-only tiles.
    // Remember the failure so we don't retry construction on every tile.
    unavailable = true;
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  return renderer;
}

/** Frame `root` in `cam` so it fills the tile without cropping. */
function frame(root: THREE.Object3D, cam: THREE.PerspectiveCamera): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // A model that parsed but has no measurable geometry would otherwise give a
  // NaN camera position and a blank frame.
  if (!Number.isFinite(size.lengthSq()) || size.lengthSq() === 0) return;

  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const dist = radius / Math.sin((cam.fov * Math.PI) / 360) + radius * 0.4;

  // A three-quarter view rather than dead-on: it reads as a figure instead of
  // a flat cut-out.
  cam.position.set(center.x + dist * 0.45, center.y + size.y * 0.15, dist);
  cam.lookAt(center.x, center.y, center.z);
  cam.updateProjectionMatrix();
}

/**
 * Render a model's thumbnail, or resolve to null when it cannot be produced
 * (no WebGL, load failure, unparseable file). Never rejects.
 */
export async function modelThumbnail(
  config: CatalogEntry,
  renderContext?: { renderer?: THREE.WebGLRenderer },
): Promise<string | null> {
  const cached = cache.get(config.id);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(config.id);
  if (pending) return pending;

  const run = buildThumbnail(config, renderContext)
    .catch(() => null)
    .then((url) => {
      cache.set(config.id, url);
      inFlight.delete(config.id);
      return url;
    });

  inFlight.set(config.id, run);
  return run;
}

async function buildThumbnail(
  config: CatalogEntry,
  renderContext?: { renderer?: THREE.WebGLRenderer },
): Promise<string | null> {
  const gl = ensureRenderer();
  if (!gl || !scene || !camera) return null;
  if (!config.path) return null;

  let root: THREE.Object3D;
  try {
    // Reuse the app's own loader so thumbnails and posed models agree on how a
    // given FBX is interpreted.
    const loaded = await loadModelFromURL(config.path, {
      renderer: renderContext?.renderer,
    });
    root = loaded.root;
  } catch {
    // Missing or corrupt file: leave this tile text-only rather than
    // rejecting the whole picker.
    return null;
  }

  try {
    normaliseForThumbnail(root);
    scene.add(root);
    frame(root, camera);
    gl.render(scene, camera);
    const url = gl.domElement.toDataURL("image/png");
    scene.remove(root);
    disposeTree(root);
    return url;
  } catch {
    return null;
  }
}

/**
 * Thumbnails need only a sensible on-screen size, not the full load path, so
 * this scales the FBX's authored units down to metres without importing the
 * catalogue (which would make this module depend on it circularly).
 */
function normaliseForThumbnail(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const height = box.max.y - box.min.y;
  if (height < 1e-6 || (height >= 0.2 && height <= 20)) return;

  const scale = 1.75 / height;
  for (const child of [...root.children]) child.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.skeleton) {
      o.bindMode = THREE.AttachedBindMode;
      o.bind(o.skeleton);
    }
  });
}

/** Release GPU memory for a thumbnail once it has been rasterised. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

/** Drop every cached thumbnail. Used by tests; not used by the app. */
export function clearThumbnailCache(): void {
  cache.clear();
  inFlight.clear();
}
