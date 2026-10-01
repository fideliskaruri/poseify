// Combinatorial scene generator.
//
// The pose generator closed the pose gap; this closes the scene gap. A scene is
// a composition, not a single element: a pose, a prop set, a camera framing
// and a light setup that suit each other. Composing those four axes produces
// far more useful scenes than any one axis alone.
//
// Every generated scene is validated against the real catalogues before it
// ships, so a scene can never reference a model, pose or prop that does not
// exist. That check is the difference between 200 scenes and 200 broken rows.
//
// MIT-licensed: every scene here is composed by this repo's own code from
// Poseify's own pose and prop libraries.

import type { SceneState } from "../src/scene/Scene";
import type { GridState, LightState } from "../src/scene/SceneEnvironment";

/** One prop placement within a generated scene. */
export interface PropPlacement {
  id: string;
  x: number;
  z: number;
  /** Facing in degrees, so a chair can face the figure. */
  facing?: number;
}

export interface GeneratedScene {
  name: string;
  description: string;
  /** Model catalogue id. */
  model: string;
  /** Pose id, resolved against the live library at build time. */
  pose: string;
  props: PropPlacement[];
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  light: Partial<LightState>;
  grid: Partial<GridState>;
}

/**
 * Themes drive the composition.
 *
 * The prop set, the camera distance and the light mood all follow from the
 * theme, so a generated scene reads as a deliberate setup rather than a random
 * assortment. This is the difference between content and noise.
 */
interface Theme {
  key: string;
  label: string;
  /** Prop ids this theme draws from. */
  props: readonly string[];
  /** How many props a scene of this theme places, min and max. */
  propCount: [number, number];
  /** Camera distance in metres from the figure. */
  distance: [number, number];
  /** Camera height in metres. */
  height: [number, number];
  /** Field of view range in degrees. */
  fov: [number, number];
  /** Azimuth and elevation ranges in degrees. */
  azimuth: [number, number];
  elevation: [number, number];
  /** Light intensity range. */
  intensity: [number, number];
  description: string;
}

export const THEMES: readonly Theme[] = [
  {
    key: "interior",
    label: "Interior",
    props: ["chair", "table", "crate", "barrel"],
    propCount: [1, 3],
    distance: [2.6, 4.2],
    height: [1.2, 1.8],
    fov: [42, 58],
    azimuth: [20, 70],
    elevation: [35, 60],
    intensity: [1.8, 2.8],
    description: "A figure among furniture, lit from one side.",
  },
  {
    key: "dungeon",
    label: "Dungeon",
    props: ["barrel", "crate", "sword", "cone"],
    propCount: [2, 4],
    distance: [3.0, 5.0],
    height: [1.0, 1.6],
    fov: [38, 52],
    azimuth: [200, 340],
    elevation: [25, 50],
    intensity: [1.0, 1.9],
    description: "Low, raking light over a cluttered set.",
  },
  {
    key: "plaza",
    label: "Plaza",
    props: ["chair", "ball", "cylinder", "plane"],
    propCount: [1, 3],
    distance: [4.0, 6.5],
    height: [1.4, 2.2],
    fov: [48, 66],
    azimuth: [100, 260],
    elevation: [45, 70],
    intensity: [2.2, 3.2],
    description: "Open air, high sun, wide framing.",
  },
  {
    key: "studio",
    label: "Studio",
    props: ["cylinder", "cone", "ball"],
    propCount: [0, 2],
    distance: [2.4, 3.8],
    height: [1.0, 1.5],
    fov: [35, 50],
    azimuth: [0, 360],
    elevation: [40, 65],
    intensity: [2.4, 3.4],
    description: "Clean product-style framing on a neutral set.",
  },
  {
    key: "arena",
    label: "Arena",
    props: ["cylinder", "cone", "sword"],
    propCount: [1, 3],
    distance: [3.4, 5.4],
    height: [1.2, 1.9],
    fov: [44, 60],
    azimuth: [0, 360],
    elevation: [30, 55],
    intensity: [2.0, 3.0],
    description: "Open ground with markers, framed for action.",
  },
  {
    key: "workshop",
    label: "Workshop",
    props: ["table", "crate", "cylinder", "ball"],
    propCount: [2, 4],
    distance: [2.8, 4.4],
    height: [1.3, 2.0],
    fov: [44, 60],
    azimuth: [150, 300],
    elevation: [40, 62],
    intensity: [2.0, 3.0],
    description: "A work surface with tools scattered around it.",
  },
];

/**
 * Deterministic pseudo-random source.
 *
 * An LCG rather than Math.random so regenerating the library produces an empty
 * diff unless an axis actually changed. A generator that reshuffles every run
 * is one nobody reviews.
 */
export function makeRandom(seed: number): () => number {
  let state = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const pickIn = (r: number, range: [number, number]): number =>
  lerp(range[0], range[1], r);

export interface SceneGenOptions {
  limit?: number;
  /** Ids available to compose from: model, poses and props. */
  models: readonly string[];
  poses: readonly string[];
  props: readonly string[];
  seed?: number;
}

/**
 * Generate scenes by composing theme x model x pose x prop layout.
 *
 * Props are placed on a ring around the figure rather than at random
 * coordinates, so a generated scene never has a prop standing inside the
 * model or half a kilometre away.
 */
export function generateScenes(options: SceneGenOptions): GeneratedScene[] {
  const {
    models,
    poses,
    props,
    limit = Infinity,
    seed = 20261001,
  } = options;

  const out: GeneratedScene[] = [];
  if (models.length === 0 || poses.length === 0) return out;

  const random = makeRandom(seed);

  for (const theme of THEMES) {
    // Only props this theme actually uses and that exist in the catalogue.
    const usableProps = theme.props.filter((p) => props.includes(p));
    if (usableProps.length === 0) continue;

    for (const model of models) {
      for (const pose of poses) {
        const count = Math.floor(
          pickIn(random(), theme.propCount) + 0.5,
        );
        const placements: PropPlacement[] = [];

        for (let i = 0; i < count; i += 1) {
          const id = usableProps[Math.floor(random() * usableProps.length)];
          // Ring placement: at least 1.1 m out so nothing intersects the
          // figure, and spread evenly rather than clumped.
          const angle =
            (i / Math.max(count, 1)) * Math.PI * 2 + random() * 0.6;
          const radius = 1.1 + random() * 1.6;
          placements.push({
            id,
            x: round2(Math.cos(angle) * radius),
            z: round2(Math.sin(angle) * radius),
            facing: Math.round(((angle * 180) / Math.PI + 360) % 360),
          });
        }

        const distance = pickIn(random(), theme.distance);
        const height = pickIn(random(), theme.height);
        // Camera orbits rather than sitting at a fixed azimuth, so a run of
        // scenes does not all look like the same shot.
        const azimuth = pickIn(random(), theme.azimuth);
        const camY = height;
        const camX = round2(
          distance * Math.cos((azimuth * Math.PI) / 180),
        );
        const camZ = round2(
          distance * Math.sin((azimuth * Math.PI) / 180),
        );

        // Names must be unique because the picker loads a scene by name. The pose
        // alone is not enough: the same pose in a different theme, or on a
        // different model, is a different scene.
        out.push({
          name: `${theme.label} / ${titleCase(model)} / ${titleCase(pose)}${placements.length > 0 ? ` + ${placements.length} prop${placements.length === 1 ? "" : "s"}` : ""}`,
          description: `${theme.description} ${model} in ${titleCase(pose)}.`,
          model,
          pose,
          props: placements,
          camera: {
            position: [camX, camY, camZ],
            target: [0, 0.95, 0],
            fov: Math.round(pickIn(random(), theme.fov)),
          },
          light: {
            azimuth: Math.round(azimuth + pickIn(random(), [20, 160])),
            elevation: Math.round(pickIn(random(), theme.elevation)),
            intensity: round2(pickIn(random(), theme.intensity)),
            distance: Math.round(pickIn(random(), [6, 12])),
            castShadows: random() > 0.15,
          },
          grid: { visible: true, cellSize: 1, divisions: 40, opacity: 0.55 },
        });

        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function titleCase(id: string): string {
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface SceneValidationIssue {
  name: string;
  reason: string;
}

/**
 * Validate a generated scene against the real catalogues.
 *
 * A scene referencing a pose or prop that does not exist loads as a broken
 * setup with a missing-item warning, which is the worst outcome: the artist
 * sees a scene and cannot tell half of it failed.
 */
export function validateScene(
  scene: GeneratedScene,
  catalogue: {
    models: ReadonlySet<string>;
    poses: ReadonlySet<string>;
    props: ReadonlySet<string>;
  },
): string[] {
  const problems: string[] = [];

  if (!catalogue.models.has(scene.model)) {
    problems.push(`unknown model "${scene.model}"`);
  }
  if (!catalogue.poses.has(scene.pose)) {
    problems.push(`unknown pose "${scene.pose}"`);
  }
  for (const prop of scene.props) {
    if (!catalogue.props.has(prop.id)) {
      problems.push(`unknown prop "${prop.id}"`);
    }
  }

  // The camera has to be able to see the figure, and a framing behind or
  // inside it is useless however valid the numbers are.
  const [cx, cy, cz] = scene.camera.position;
  const distance = Math.hypot(cx, cz);
  if (!(distance > 0.5)) {
    problems.push("camera sits inside the figure");
  }
  if (!(scene.camera.fov > 5 && scene.camera.fov < 140)) {
    problems.push(`unusable field of view (${scene.camera.fov})`);
  }

  // A prop at the origin stands inside the model.
  for (const prop of scene.props) {
    if (Math.hypot(prop.x, prop.z) < 0.5) {
      problems.push(`prop "${prop.id}" overlaps the figure`);
    }
  }

  return problems;
}

export function validateScenes(
  scenes: readonly GeneratedScene[],
  catalogue: {
    models: ReadonlySet<string>;
    poses: ReadonlySet<string>;
    props: ReadonlySet<string>;
  },
): { shipped: GeneratedScene[]; issues: SceneValidationIssue[] } {
  const shipped: GeneratedScene[] = [];
  const issues: SceneValidationIssue[] = [];
  const seen = new Set<string>();

  for (const scene of scenes) {
    const problems = validateScene(scene, catalogue);
    if (problems.length > 0) {
      issues.push({ name: scene.name, reason: problems.join("; ") });
      continue;
    }
    // Names must be unique: the picker loads a scene by name, and two scenes
    // sharing one means the second silently replaces the first.
    if (seen.has(scene.name)) {
      issues.push({ name: scene.name, reason: "duplicate scene name" });
      continue;
    }
    seen.add(scene.name);
    shipped.push(scene);
  }
  return { shipped, issues };
}

/**
 * Convert a validated scene into the app's SceneState.
 *
 * Kept here rather than in the build script so the conversion is exercised by
 * the same tests that validate the composition.
 */
export function toSceneState(
  scene: GeneratedScene,
  pose: { bones: SceneState["models"][number]["pose"]; rootOffset?: [number, number, number] },
): SceneState {
  return {
    version: 1,
    name: scene.name,
    models: [
      {
        id: scene.model,
        pose: pose.bones,
        ...(pose.rootOffset ? { rootOffset: pose.rootOffset } : {}),
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ],
    props: scene.props.map((p) => ({
      id: p.id,
      transform: {
        position: [p.x, 0, p.z],
        rotation: quatFromFacing(p.facing ?? 0),
        scale: [1, 1, 1],
      },
    })),
    camera: scene.camera,
    light: {
      azimuth: 40,
      elevation: 55,
      intensity: 2.4,
      distance: 9,
      castShadows: true,
      ...scene.light,
    },
    grid: { visible: true, cellSize: 1, divisions: 40, opacity: 0.55, ...scene.grid },
  };
}

/** Yaw quaternion for a prop facing, in degrees. */
function quatFromFacing(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360;
  return [0, Math.sin(half), 0, Math.cos(half)];
}


