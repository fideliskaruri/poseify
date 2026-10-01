// Image planes.
//
// An image placed as a real quad in the scene, so the artist can compose
// against it and check perspective and foreshortening the same way they would
// with a photograph behind the figure. Kept as a distinct object type because
// an image plane has no volume and should not participate in prop snapping.

import * as THREE from "three";

export interface ImagePlaneState {
  width: number;
  height: number;
  opacity: number;
  castShadow: boolean;
  doubleSided: boolean;
}

export const DEFAULT_IMAGE_PLANE: ImagePlaneState = {
  width: 1,
  height: 1,
  opacity: 1,
  castShadow: false,
  doubleSided: false,
};

export interface ImagePlaneResult {
  mesh: THREE.Mesh;
  state: ImagePlaneState;
  sourceSize: { width: number; height: number } | null;
  dispose: () => void;
}

/**
 * Create an image plane from a URL or blob URL.
 *
 * The plane keeps the image's aspect ratio by default, because a stretched
 * reference makes perspective harder to judge, not easier.
 */
export async function createImagePlane(
  source: string,
  overrides: Partial<ImagePlaneState> = {},
): Promise<ImagePlaneResult> {
  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(source);
  texture.colorSpace = THREE.SRGBColorSpace;

  const image = texture.image as { width?: number; height?: number } | undefined;
  const sourceSize = {
    width: image?.width ?? 0,
    height: image?.height ?? 0,
  };

  const aspect =
    sourceSize.width > 0 && sourceSize.height > 0
      ? sourceSize.width / sourceSize.height
      : 1;

  const width = overrides.width ?? DEFAULT_IMAGE_PLANE.width;
  const state: ImagePlaneState = {
    ...DEFAULT_IMAGE_PLANE,
    width,
    height: overrides.height ?? width / aspect,
    opacity: overrides.opacity ?? DEFAULT_IMAGE_PLANE.opacity,
    castShadow: overrides.castShadow ?? DEFAULT_IMAGE_PLANE.castShadow,
    doubleSided: overrides.doubleSided ?? DEFAULT_IMAGE_PLANE.doubleSided,
  };

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: state.opacity < 1,
    opacity: state.opacity,
    side: state.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(state.width, state.height),
    material,
  );
  mesh.name = "ImagePlane";
  mesh.castShadow = state.castShadow;
  mesh.receiveShadow = false;

  return {
    mesh,
    state,
    sourceSize,
    dispose: () => {
      texture.dispose();
      material.dispose();
      (mesh.geometry as THREE.BufferGeometry).dispose();
    },
  };
}

/** Update an existing image plane's size, opacity and sidedness in place. */
export function updateImagePlane(
  mesh: THREE.Mesh,
  state: Partial<ImagePlaneState>,
): void {
  const material = mesh.material as THREE.MeshBasicMaterial;

  if (state.width !== undefined || state.height !== undefined) {
    const geometry = mesh.geometry as THREE.PlaneGeometry;
    const width = state.width ?? geometry.parameters.width;
    const height = state.height ?? geometry.parameters.height;
    if (
      geometry.parameters.width !== width ||
      geometry.parameters.height !== height
    ) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(width, height);
    }
  }

  if (state.opacity !== undefined) {
    material.opacity = state.opacity;
    material.transparent = state.opacity < 1;
    mesh.visible = state.opacity > 0.001;
  }
  if (state.doubleSided !== undefined) {
    material.side = state.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    material.needsUpdate = true;
  }
  if (state.castShadow !== undefined) {
    mesh.castShadow = state.castShadow;
  }
}
