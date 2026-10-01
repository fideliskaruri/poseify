// The built-in CC0 prop starter set, generated from primitives.
//
// Building props in code rather than sourcing meshes keeps the licence clean
// and means the shipped assets are original work covered by the project's MIT
// licence. Each is sized in real metres so a figure can plausibly interact
// with it: a 0.45 m seat, a 0.75 m table, a 1.0 m barrel.

import * as THREE from "three";
import type { PropBuilderId, PropConfig } from "./PropSystem";

const WOOD = 0x8a5f3c;
const WOOD_DARK = 0x6b482c;
const METAL = 0x9aa2ab;
const LEATHER = 0x7a5230;

function material(
  color: number,
  roughness = 0.7,
  metalness = 0.05,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Seat height in metres, matching a real chair.
export const SEAT_HEIGHT = 0.45;
// Tabletop height in metres.
export const TABLE_HEIGHT = 0.75;
// Sword height in metres.
export const SWORD_LENGTH = 1.13;

function buildChair(): THREE.Object3D {
  const root = new THREE.Group();
  const seatY = SEAT_HEIGHT;
  const halfW = 0.21;
  const halfD = 0.2;
  const legH = seatY;

  root.add(box(halfW * 2, 0.05, halfD * 2, WOOD, 0, seatY, 0));
  root.add(box(halfW * 2, 0.45, 0.045, WOOD, 0, seatY + 0.24, -halfD));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(
        box(
          0.045,
          legH,
          0.045,
          WOOD_DARK,
          sx * (halfW - 0.03),
          legH / 2,
          sz * (halfD - 0.03),
        ),
      );
    }
  }
  root.add(
    box(halfW * 2 - 0.06, 0.03, 0.03, WOOD_DARK, 0, legH * 0.35, halfD - 0.03),
  );
  root.add(
    box(halfW * 2 - 0.06, 0.03, 0.03, WOOD_DARK, 0, legH * 0.35, -halfD + 0.03),
  );
  return root;
}

function buildTable(): THREE.Object3D {
  const root = new THREE.Group();
  const halfW = 0.45;
  const halfD = 0.35;
  root.add(box(halfW * 2, 0.05, halfD * 2, WOOD, 0, TABLE_HEIGHT, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      root.add(
        box(
          0.05,
          TABLE_HEIGHT,
          0.05,
          WOOD_DARK,
          sx * (halfW - 0.05),
          TABLE_HEIGHT / 2,
          sz * (halfD - 0.05),
        ),
      );
    }
  }
  return root;
}

function buildBarrel(): THREE.Object3D {
  const root = new THREE.Group();
  const body = cylinder(0.22, 0.26, 0.88, WOOD, 20);
  body.position.y = 0.44;
  root.add(body);

  for (const y of [0.12, 0.44, 0.76]) {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.245, 0.018, 8, 24),
      material(METAL, 0.4, 0.8),
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    hoop.castShadow = true;
    root.add(hoop);
  }

  const lid = cylinder(0.23, 0.23, 0.04, WOOD_DARK, 20);
  lid.position.y = 0.9;
  root.add(lid);
  return root;
}

function buildSword(): THREE.Object3D {
  const root = new THREE.Group();

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.78, 0.014),
    material(METAL, 0.25, 0.9),
  );
  blade.position.y = 0.78 / 2 + 0.12;
  blade.castShadow = true;
  root.add(blade);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.1, 4),
    material(METAL, 0.25, 0.9),
  );
  tip.position.y = 0.07;
  tip.rotation.y = Math.PI / 4;
  tip.castShadow = true;
  root.add(tip);

  root.add(box(0.24, 0.03, 0.04, METAL, 0, 0.92, 0));
  root.add(box(0.035, 0.16, 0.035, LEATHER, 0, 1.0, 0));

  const pommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 10, 8),
    material(METAL, 0.3, 0.9),
  );
  pommel.position.y = 1.1;
  pommel.castShadow = true;
  root.add(pommel);
  return root;
}

function buildBall(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 16),
    material(0xc94f4f, 0.55, 0.05),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return root;
}

function buildCrate(): THREE.Object3D {
  const root = new THREE.Group();
  const s = 0.45;
  root.add(box(s, s, s, WOOD, 0, s / 2, 0));
  const t = 0.05;
  for (const sy of [-1, 1]) {
    // Inset so the battens sit flush with the crate rather than proud of it,
    // keeping the overall footprint equal to the crate's side length.
    const inset = s / 2 - t / 2;
    const y = s / 2 + (sy * (s / 2 - t / 2));
    root.add(box(s, t, t, WOOD_DARK, 0, y, inset));
    root.add(box(s, t, t, WOOD_DARK, 0, y, -inset));
  }
  return root;
}

function buildCylinder(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = cylinder(0.2, 0.2, 0.5, METAL, 20);
  mesh.position.y = 0.25;
  root.add(mesh);
  return root;
}

function buildCone(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.5, 20),
    material(0xc98a4f, 0.75),
  );
  mesh.position.y = 0.25;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return root;
}

function buildPlane(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.02, 1),
    material(0x7a7f88, 0.85),
  );
  mesh.position.y = 0.01;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  root.add(mesh);
  return root;
}

const BUILDERS: Record<PropBuilderId, () => THREE.Object3D> = {
  chair: buildChair,
  table: buildTable,
  barrel: buildBarrel,
  sword: buildSword,
  ball: buildBall,
  crate: buildCrate,
  cylinder: buildCylinder,
  cone: buildCone,
  plane: buildPlane,
};

/** Build a built-in prop by id. */
export function buildProp(id: PropBuilderId): THREE.Object3D {
  const builder = BUILDERS[id];
  if (!builder) throw new Error(`Unknown prop builder: ${id}`);
  const root = builder();
  root.name = `prop_${id}`;
  return root;
}

// The props Poseify ships. All generated in code, so all MIT.
export const PROP_CATALOG: readonly PropConfig[] = [
  { id: "chair", name: "Chair", family: "furniture", tags: ["chair", "seat", "sit"], size: [0.42, 0.92, 0.4], procedural: "chair" },
  { id: "table", name: "Table", family: "furniture", tags: ["table", "desk"], size: [0.9, 0.75, 0.7], procedural: "table" },
  { id: "barrel", name: "Barrel", family: "props", tags: ["barrel", "round"], size: [0.52, 0.92, 0.52], procedural: "barrel" },
  { id: "sword", name: "Sword", family: "weapons", tags: ["sword", "blade", "weapon"], size: [0.24, 1.13, 0.09], procedural: "sword" },
  { id: "ball", name: "Ball", family: "props", tags: ["ball", "sphere", "round"], size: [0.24, 0.24, 0.24], procedural: "ball" },
  { id: "crate", name: "Crate", family: "props", tags: ["crate", "box", "storage"], size: [0.45, 0.45, 0.45], procedural: "crate" },
  { id: "cylinder", name: "Cylinder", family: "primitives", tags: ["cylinder", "primitive"], size: [0.4, 0.5, 0.4], procedural: "cylinder" },
  { id: "cone", name: "Cone", family: "primitives", tags: ["cone", "primitive"], size: [0.44, 0.5, 0.44], procedural: "cone" },
  { id: "plane", name: "Plane", family: "primitives", tags: ["plane", "primitive", "flat"], size: [1, 0.02, 1], procedural: "plane" },
];

export function findProp(id: string): PropConfig | undefined {
  return PROP_CATALOG.find((p) => p.id === id);
}
