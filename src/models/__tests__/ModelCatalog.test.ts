import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  findModel,
  isVendorModel,
  loadModel,
  normaliseToMetres,
} from "../ModelCatalog";
import { VENDOR_BASE } from "../VendorCatalog";
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
  it("gives every model a vendor file to load", () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(0);
    for (const config of MODEL_CATALOG) {
      expect(isVendorModel(config)).toBe(true);
      expect(config.path).toBeTruthy();
      expect(config.path!.startsWith(`${VENDOR_BASE}/`)).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    expect(dupe(MODEL_CATALOG.map((m) => m.id))).toEqual([]);
  });

  it("has no duplicate paths among the vendor models", () => {
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

  it("marks the models without a humanoid rig as not exportable", () => {
    // Mermaids, werewolf and horse cannot satisfy the 20-bone contract, so
    // OBJ export is disabled for them. The CSV's `exportable` column says the
    // same thing. zombie_alien is deliberately excluded: it does resolve the
    // contract (verified by tools/verify-models.ts) and the CSV exports it.
    const nonHuman = ["female_mermaid", "male_mermaid", "werewolf", "horse"];
    for (const id of nonHuman) {
      const config = findModel(id);
      expect(config, `${id} should be in the catalogue`).toBeDefined();
      expect(config!.exportable, `${id} should not be exportable`).toBe(false);
    }
  });

  it("keeps exportable set on every model that does resolve the contract", () => {
    for (const m of MODEL_CATALOG) {
      if (m.exportable) continue;
      expect(["female_mermaid", "male_mermaid", "werewolf", "horse"]).toContain(
        m.id,
      );
    }
  });

  it("ships enough humanoids and stylized figures to pose with", () => {
    const poseable = MODEL_CATALOG.filter(
      (m) => m.family === "human" || m.family === "stylized",
    );
    expect(poseable.length).toBeGreaterThanOrEqual(10);
  });

  it("finds a model by id and returns undefined for an unknown id", () => {
    const first = MODEL_CATALOG[0];
    expect(findModel(first.id)?.id).toBe(first.id);
    expect(findModel("definitely-not-a-model")).toBeUndefined();
  });
});

describe("loadModel", () => {
  it("rejects a config with no vendor path instead of building an empty model", async () => {
    const bogus = { ...DEFAULT_LOAD_CONFIG, id: "bogus", name: "Bogus" };
    await expect(loadModel(bogus)).rejects.toThrow(/no vendor file/i);
  });
});

describe("normaliseToMetres", () => {
  it("leaves an already-metre-scale figure alone", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.75, 0.3)));
    expect(normaliseToMetres(root)).toBe(1);
  });

  it("leaves a tall animal alone rather than flattening it to human height", () => {
    // A horse is roughly 1.6 m at the withers, but a big one plus a raised
    // head clears 2 m. Rescaling that to exactly 1.75 would distort it
    // relative to a human standing beside it, so it must be left as authored.
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


