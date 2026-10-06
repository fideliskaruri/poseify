import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  findModel,
  isBundledModel,
  loadModel,
  normaliseToMetres,
} from "../ModelCatalog";
import { DEFAULT_LOAD_CONFIG } from "../ModelLoadConfig";

function dupe(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const v of values) {
    const s = v ?? "<undefined>";
    if (seen.has(s)) dupes.push(s);
    seen.add(s);
  }
  return dupes;
}

describe("model catalogue", () => {
  it("ships at least one bundled figure with a path", () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(0);
    for (const config of MODEL_CATALOG) {
      expect(isBundledModel(config)).toBe(true);
      expect(config.path).toBeTruthy();
      expect(config.path!.startsWith("/models/")).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    expect(dupe(MODEL_CATALOG.map((m) => m.id))).toEqual([]);
  });

  it("has no duplicate paths", () => {
    const paths = MODEL_CATALOG.filter((m) => m.path).map((m) => m.path);
    expect(dupe(paths)).toEqual([]);
  });

  it("gives every model a name, family and tags", () => {
    for (const config of MODEL_CATALOG) {
      expect(config.name.length).toBeGreaterThan(0);
      expect(config.family.length).toBeGreaterThan(0);
      expect(Array.isArray(config.tags)).toBe(true);
    }
  });

  it("finds a model by id and returns undefined for an unknown id", () => {
    const first = MODEL_CATALOG[0];
    expect(findModel(first.id)?.id).toBe(first.id);
    expect(findModel("definitely-not-a-model")).toBeUndefined();
  });
});

describe("loadModel", () => {
  it("rejects a config with no path instead of building an empty model", async () => {
    const bogus = { ...DEFAULT_LOAD_CONFIG, id: "bogus", name: "Bogus" };
    await expect(loadModel(bogus)).rejects.toThrow(/no file to load/i);
  });
});

describe("normaliseToMetres", () => {
  it("leaves an already-metre-scale figure alone", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.75, 0.3)));
    expect(normaliseToMetres(root)).toBe(1);
  });

  it("leaves a tall animal alone rather than flattening it to human height", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.8)));
    expect(normaliseToMetres(root)).toBe(1);
  });

  it("leaves a small creature alone rather than inflating it", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1)));
    expect(normaliseToMetres(root)).toBe(1);
  });

  it("rescales a model authored in centimetres", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(40, 176, 20)));
    const scale = normaliseToMetres(root);
    expect(scale).toBeCloseTo(1.75 / 176, 6);
    root.updateMatrixWorld(true);
    const height = new THREE.Box3()
      .setFromObject(root)
      .max.clone()
      .sub(new THREE.Box3().setFromObject(root).min).y;
    expect(height).toBeCloseTo(1.75, 6);
  });

  it("returns 1 for an empty model rather than dividing by zero", () => {
    expect(normaliseToMetres(new THREE.Group())).toBe(1);
  });
});
