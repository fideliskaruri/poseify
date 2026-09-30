// Offscreen thumbnail rendering for the model picker.
//
// Each model is rendered once to a small PNG data URL and cached. This keeps
// the picker grid visual without shipping image assets, and costs nothing
// until a picker is actually opened.

import * as THREE from "three";
import {
  instantiateModel,
  isVendorModel,
  type CatalogEntry,
} from "./ModelCatalog";

const THUMB_SIZE = 128;
const cache = new Map<string, string>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
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

/** Render a model's thumbnail, or return null when WebGL is unavailable. */
export function modelThumbnail(config: CatalogEntry): string | null {
  const cached = cache.get(config.id);
  if (cached !== undefined) return cached;

  // Remote FBX models cannot be built synchronously, so they render a
  // placeholder tile until they are actually loaded into the scene.
  if (isVendorModel(config)) return null;

  const gl = ensureRenderer();
  if (!gl || !scene || !camera) return null;

  let url: string;
  try {
    const { root } = instantiateModel(config);
    scene.add(root);

    // Frame the figure: centre on it and pull back to fit its bounds.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const dist = radius / Math.sin((camera.fov * Math.PI) / 360) + radius * 0.4;

    camera.position.set(
      center.x + dist * 0.45,
      center.y + size.y * 0.15,
      dist,
    );
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();

    gl.render(scene, camera);
    url = gl.domElement.toDataURL("image/png");
    scene.remove(root);
  } catch {
    return null;
  }

  cache.set(config.id, url);
  return url;
}

/** Warm the cache for the visible tiles only, so opening the picker stays fast. */
export function primeThumbnails(configs: readonly CatalogEntry[]): void {
  if (typeof document === "undefined") return;
  for (const config of configs) modelThumbnail(config);
}
