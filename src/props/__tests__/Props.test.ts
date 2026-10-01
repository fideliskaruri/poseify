import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  PROP_CATALOG,
  SEAT_HEIGHT,
  SWORD_LENGTH,
  TABLE_HEIGHT,
  buildProp,
  findProp,
} from "../PropCatalog";
import {
  centreOnOrigin,
  extentOf,
  measure,
  snapToFloor,
  snapTopTo,
  topOf,
} from "../PropSystem";
import { updateImagePlane } from "../ImagePlane";

describe("prop catalogue", () => {
  it("ships the required starter props", () => {
    for (const id of ["chair", "table", "barrel", "sword", "ball"]) {
      expect(findProp(id), id).toBeDefined();
    }
  });

  it("has unique ids", () => {
    const ids = PROP_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every prop a builder and a positive real-world size", () => {
    for (const prop of PROP_CATALOG) {
      expect(prop.procedural, prop.id).toBeDefined();
      expect(prop.size.every((n) => n > 0), prop.id).toBe(true);
    }
  });

  it("declares realistic furniture heights", () => {
    expect(SEAT_HEIGHT).toBeGreaterThan(0.35);
    expect(SEAT_HEIGHT).toBeLessThan(0.55);
    expect(TABLE_HEIGHT).toBeGreaterThan(0.65);
    expect(TABLE_HEIGHT).toBeLessThan(0.85);
  });
});

describe("procedural prop geometry", () => {
  it("builds every catalogue prop without throwing", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      expect(root, prop.id).toBeDefined();
      expect(root.children.length, prop.id).toBeGreaterThan(0);
    }
  });

  it("builds real geometry, not empty groups", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      let meshes = 0;
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes += 1;
      });
      expect(meshes, prop.id).toBeGreaterThan(0);
      expect(measure(root).isEmpty(), prop.id).toBe(false);
    }
  });

  it("sizes props close to their declared dimensions", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      const box = measure(root);
      const actual: [number, number, number] = [
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
      ];
      // 15% slack: the catalogue size is a guide, not a contract.
      for (let axis = 0; axis < 3; axis++) {
        const error =
          Math.abs(actual[axis] - prop.size[axis]) / prop.size[axis];
        expect(error, `${prop.id} axis ${axis}`).toBeLessThan(0.15);
      }
    }
  });

  it("a chair has enough parts to read as a chair", () => {
    const chair = buildProp("chair");
    expect(chair.children.length).toBeGreaterThan(4);
    expect(topOf(chair)).toBeGreaterThan(SEAT_HEIGHT);
  });

  it("a sword is roughly human-scaled", () => {
    const box = measure(buildProp("sword"));
    expect(box.max.y - box.min.y).toBeCloseTo(SWORD_LENGTH, 1);
  });

  it("marks meshes to cast shadows", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      let casters = 0;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.castShadow) casters += 1;
      });
      expect(casters, prop.id).toBeGreaterThan(0);
    }
  });
});

describe("prop snapping", () => {
  it("snapToFloor puts the lowest point on the ground", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      root.position.y = 5;
      snapToFloor(root);
      expect(measure(root).min.y, prop.id).toBeCloseTo(0, 5);
    }
  });

  it("snapToFloor keeps the horizontal position", () => {
    const crate = buildProp("crate");
    crate.position.set(2, 3, -4);
    snapToFloor(crate);
    const box = measure(crate);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(2, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-4, 5);
  });

  it("snapTopTo moves a prop to a requested height", () => {
    const barrel = buildProp("barrel");
    snapTopTo(barrel, 1.2);
    expect(topOf(barrel)).toBeCloseTo(1.2, 5);
  });

  it("centreOnOrigin centres in XZ and grounds in Y", () => {
    for (const prop of PROP_CATALOG) {
      const root = buildProp(prop.procedural!);
      root.position.set(3, 2, -5);
      centreOnOrigin(root);
      const box = measure(root);
      expect((box.min.x + box.max.x) / 2, prop.id).toBeCloseTo(0, 5);
      expect((box.min.z + box.max.z) / 2, prop.id).toBeCloseTo(0, 5);
      expect(box.min.y, prop.id).toBeCloseTo(0, 5);
    }
  });

  it("reports extents for clearance calculations", () => {
    const crate = buildProp("crate");
    expect(extentOf(crate, "x")).toBeGreaterThan(0.3);
    expect(extentOf(crate, "x")).toBeCloseTo(extentOf(crate, "z"), 3);
  });

  it("handles an empty object without throwing", () => {
    const empty = new THREE.Object3D();
    expect(() => snapToFloor(empty)).not.toThrow();
    expect(() => centreOnOrigin(empty)).not.toThrow();
    expect(topOf(empty)).toBe(0);
  });
});

describe("image planes", () => {
  function makePlane(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial(),
    );
  }

  it("resizes geometry when width or height change", () => {
    const mesh = makePlane();
    updateImagePlane(mesh, { width: 4, height: 2 });
    const geometry = mesh.geometry as THREE.PlaneGeometry;
    expect(geometry.parameters.width).toBe(4);
    expect(geometry.parameters.height).toBe(2);
  });

  it("keeps the unchanged dimension when only one is given", () => {
    const mesh = makePlane();
    updateImagePlane(mesh, { width: 5 });
    const geometry = mesh.geometry as THREE.PlaneGeometry;
    expect(geometry.parameters.width).toBe(5);
    expect(geometry.parameters.height).toBe(1);
  });

  it("sets opacity and transparency together", () => {
    const mesh = makePlane();
    const material = mesh.material as THREE.MeshBasicMaterial;
    updateImagePlane(mesh, { opacity: 0.4 });
    expect(material.opacity).toBeCloseTo(0.4, 5);
    expect(material.transparent).toBe(true);
  });

  it("hides a fully transparent plane", () => {
    const mesh = makePlane();
    updateImagePlane(mesh, { opacity: 0 });
    expect(mesh.visible).toBe(false);
    updateImagePlane(mesh, { opacity: 1 });
    expect(mesh.visible).toBe(true);
  });

  it("toggles sidedness", () => {
    const mesh = makePlane();
    const material = mesh.material as THREE.MeshBasicMaterial;
    updateImagePlane(mesh, { doubleSided: true });
    expect(material.side).toBe(THREE.DoubleSide);
    updateImagePlane(mesh, { doubleSided: false });
    expect(material.side).toBe(THREE.FrontSide);
  });

  it("toggles shadow casting", () => {
    const mesh = makePlane();
    updateImagePlane(mesh, { castShadow: true });
    expect(mesh.castShadow).toBe(true);
  });
});
