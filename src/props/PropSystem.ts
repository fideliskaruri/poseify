// Props: objects placed in the scene alongside the posed figure.
//
// Props are plain Object3Ds rather than rigged skeletons, so they are cheap to
// add and can be any geometry the user imports. The interesting behaviour is
// snapping: dropping a chair should put its legs on the floor, and props the
// figure interacts with should sit at a believable height rather than at the
// world origin.

import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export type PropBuilderId =
  | "chair"
  | "table"
  | "barrel"
  | "sword"
  | "ball"
  | "crate"
  | "cylinder"
  | "cone"
  | "plane";

export interface PropConfig {
  id: string;
  name: string;
  family: string;
  tags: readonly string[];
  // Approximate real-world size in metres, used for framing and snapping.
  size: [number, number, number];
  procedural?: PropBuilderId;
  path?: string;
}

export interface LoadedProp {
  config: PropConfig;
  root: THREE.Object3D;
}

function axisExtent(box: THREE.Box3, axis: "x" | "y" | "z"): number {
  if (axis === "x") return box.max.x - box.min.x;
  if (axis === "y") return box.max.y - box.min.y;
  return box.max.z - box.min.z;
}

/** Bounding box in world space. */
export function measure(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

/**
 * Drop a prop onto the floor: translate it so its lowest point sits on y = 0,
 * keeping its horizontal position. Snapping by bounds rather than by geometry
 * origin matters because imported meshes rarely have their origin at their base.
 */
export function snapToFloor(object: THREE.Object3D, floorY = 0): number {
  const box = measure(object);
  if (box.isEmpty()) return 0;
  const delta = floorY - box.min.y;
  object.position.y += delta;
  object.updateMatrixWorld(true);
  return delta;
}

/** Snap a prop so its top surface meets a given height. */
export function snapTopTo(
  object: THREE.Object3D,
  height: number,
  axis: "x" | "y" | "z" = "y",
): void {
  const box = measure(object);
  if (box.isEmpty()) return;
  if (axis === "y") object.position.y -= box.max.y - height;
  else if (axis === "z") object.position.z -= box.max.z - height;
  else object.position.x -= box.max.x - height;
  object.updateMatrixWorld(true);
}

/** Place a prop a set distance from a point, facing it. */
export function snapBeside(
  prop: THREE.Object3D,
  target: THREE.Vector3,
  distance: number,
  facingRadians: number,
): void {
  prop.position.set(
    target.x + Math.sin(facingRadians) * distance,
    prop.position.y,
    target.z + Math.cos(facingRadians) * distance,
  );
  prop.rotation.y = facingRadians;
  prop.updateMatrixWorld(true);
}

/**
 * Centre a prop on the origin in X/Z and drop it to the floor in Y.
 * Used when adding, so props appear where the artist expects instead of at an
 * arbitrary imported offset.
 */
export function centreOnOrigin(object: THREE.Object3D): void {
  const box = measure(object);
  if (box.isEmpty()) return;
  object.position.x -= (box.min.x + box.max.x) / 2;
  object.position.z -= (box.min.z + box.max.z) / 2;
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
}

/** Height of a prop's top surface above its own origin. */
export function topOf(object: THREE.Object3D): number {
  const box = measure(object);
  return box.isEmpty() ? 0 : box.max.y;
}

/** Depth of a prop along one axis, used for clearance when placing. */
export function extentOf(
  object: THREE.Object3D,
  axis: "x" | "y" | "z",
): number {
  return axisExtent(measure(object), axis);
}

let dracoLoader: DRACOLoader | null = null;

function getDraco(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    );
  }
  return dracoLoader;
}

/** Load a prop from an OBJ or GLB/GLTF URL. */
export async function loadPropFromURL(url: string): Promise<THREE.Object3D> {
  const clean = url.split("?")[0].toLowerCase();

  if (clean.endsWith(".obj")) {
    const root = await new OBJLoader().loadAsync(url);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return root;
  }

  if (clean.endsWith(".glb") || clean.endsWith(".gltf")) {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDraco());
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return gltf.scene;
  }

  throw new Error(`Unsupported prop format: ${url}`);
}

/** Load a prop from a user-supplied File via an object URL. */
export async function loadPropFromFile(file: File): Promise<THREE.Object3D> {
  const url = URL.createObjectURL(file);
  try {
    return await loadPropFromURL(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
