import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DepthPreview } from "../DepthPreview";

/**
 * Preview Depth state discipline.
 *
 * The objective asks for ten toggles to return the viewport to its exact prior
 * state with no leaked renderer state. The subtle case is a foreign override
 * already installed (an export in flight): restoring to null would clobber it.
 */
function makePreview() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  return { scene, camera, preview: new DepthPreview(scene, camera) };
}

describe("DepthPreview", () => {
  it("is off by default and installs an override when turned on", () => {
    const { scene, preview } = makePreview();
    expect(preview.active).toBe(false);
    expect(scene.overrideMaterial).toBeNull();
    preview.set(true);
    expect(preview.active).toBe(true);
    expect(scene.overrideMaterial).not.toBeNull();
  });

  it("restores a null override to exactly null", () => {
    const { scene, preview } = makePreview();
    preview.set(true);
    preview.set(false);
    expect(preview.active).toBe(false);
    expect(scene.overrideMaterial).toBeNull();
  });

  it("returns to its exact prior override after ten toggles", () => {
    const { scene, preview } = makePreview();
    // An export may be mid-flight with its own override material installed.
    const foreign = new THREE.MeshBasicMaterial();
    scene.overrideMaterial = foreign;
    for (let i = 0; i < 10; i += 1) {
      preview.set(true);
      expect(scene.overrideMaterial).not.toBe(foreign);
      preview.set(false);
    }
    expect(scene.overrideMaterial).toBe(foreign);
  });

  it("is idempotent, so a repeated call cannot capture its own material", () => {
    const { scene, preview } = makePreview();
    preview.set(true);
    const installed = scene.overrideMaterial;
    preview.set(true);
    expect(scene.overrideMaterial).toBe(installed);
    preview.set(false);
    expect(scene.overrideMaterial).toBeNull();
  });

  it("toggle alternates and dispose restores the prior state", () => {
    const { scene, preview } = makePreview();
    const foreign = new THREE.MeshBasicMaterial();
    scene.overrideMaterial = foreign;
    preview.toggle();
    expect(preview.active).toBe(true);
    preview.toggle();
    expect(preview.active).toBe(false);
    expect(scene.overrideMaterial).toBe(foreign);
    preview.set(true);
    preview.dispose();
    expect(scene.overrideMaterial).toBe(foreign);
  });

  it("disposing while off changes nothing", () => {
    const { scene, preview } = makePreview();
    preview.dispose();
    expect(scene.overrideMaterial).toBeNull();
  });
});
