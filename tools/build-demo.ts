// Build the demo page: one static page that renders real poses from the
// library at build time, with no server, no runtime cost and no per-pose page.
//
// The figures are drawn with a real forward-kinematics walk over the rig
// contract's rest pose, so a raised arm reads as a raised arm. Reading joint
// rotations straight out of the pose record would scatter the joints and draw
// flat lines, which is exactly what the first version of this file did.
//
// Usage:  npm run demo:build

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { POSE_LIBRARY, findPoseById } from "../src/pose/PoseLibrary";
import { FULL_PARENTS } from "../src/rig/RigContract";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist", "demo");

const SHOWCASE = [
  { pose: "sword_ready", caption: "Weapon ready" },
  { pose: "seated_relaxed", caption: "Seated, relaxed" },
  { pose: "run_contact_left", caption: "Running, contact" },
  { pose: "kneel_prayer", caption: "Kneeling, prayer" },
];

const DRAWABLE = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
];

const CHAINS = [
  ["Hips", "Spine"], ["Spine", "Spine1"], ["Spine1", "Spine2"],
  ["Spine2", "Neck"], ["Neck", "Head"],
  ["Spine2", "LeftShoulder"], ["LeftShoulder", "LeftArm"],
  ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["Spine2", "RightShoulder"], ["RightShoulder", "RightArm"],
  ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["Hips", "LeftUpLeg"], ["LeftUpLeg", "LeftLeg"],
  ["LeftLeg", "LeftFoot"], ["LeftFoot", "LeftToeBase"],
  ["Hips", "RightUpLeg"], ["RightUpLeg", "RightLeg"],
  ["RightLeg", "RightFoot"], ["RightFoot", "RightToeBase"],
];

/**
 * Rest world positions for a ~1.75 m figure, in metres.
 *
 * Mirrors the fixture in src/posing/__tests__/posingFixtures.ts. Duplicated
 * rather than imported so the demo build has no dependency on the test tree,
 * which is excluded from the app tsconfig.
 */
const REST = {
  Hips: [0, 0.94, 0],
  Spine: [0, 1.03, 0],
  Spine1: [0, 1.12, 0],
  Spine2: [0, 1.21, 0],
  Neck: [0, 1.3, 0],
  Head: [0, 1.37, 0],
  LeftShoulder: [0.05, 1.27, 0],
  LeftArm: [0.16, 1.27, 0],
  LeftForeArm: [0.33, 1.27, 0],
  LeftHand: [0.48, 1.27, 0],
  RightShoulder: [0.05, 1.27, 0],
  RightArm: [0.16, 1.27, 0],
  RightForeArm: [0.33, 1.27, 0],
  RightHand: [0.48, 1.27, 0],
  LeftUpLeg: [0.08, 0.92, 0],
  LeftLeg: [0.08, 0.51, 0],
  LeftFoot: [0.08, 0.09, 0],
  LeftToeBase: [0.08, 0.04, 0.13],
  RightUpLeg: [0.08, 0.92, 0],
  RightLeg: [0.08, 0.51, 0],
  RightFoot: [0.08, 0.09, 0],
  RightToeBase: [0.08, 0.04, 0.13],
};

function restOf(bone) {
  const base = REST[bone] || [0, 0.5, 0];
  // Right-side bones mirror across the sagittal plane.
  return new THREE.Vector3(
    bone.startsWith("Right") ? -base[0] : base[0],
    base[1],
    base[2],
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Forward-kinematics projection of one pose into world positions.
 *
 * Parent-first, exactly as the rig does at runtime: a bone's rest offset is
 * rotated by its parent's accumulated rotation and added to the parent's new
 * position. Reusing that rule is what makes the demo honest about what the
 * poses look like.
 */
function poseWorldPositions(pose) {
  const quats = new Map();
  const world = new Map();

  // Depth-sort so a parent is always evaluated before its children.
  const depthOf = function (bone, guard) {
    const g = guard || 0;
    const parent = FULL_PARENTS[bone];
    if (!parent || g > 64) return 0;
    return 1 + depthOf(parent, g + 1);
  };
  const ordered = DRAWABLE.slice().sort(function (a, b) {
    return depthOf(a) - depthOf(b);
  });

  for (const bone of ordered) {
    const rest = restOf(bone);
    const parentName = FULL_PARENTS[bone];
    const parentRest = parentName ? restOf(parentName) : null;
    const parentQuat = parentName ? quats.get(parentName) : null;
    const parentWorld = parentName ? world.get(parentName) : null;

    const offset = rest.clone();
    if (parentRest) offset.sub(parentRest);
    if (parentQuat) offset.applyQuaternion(parentQuat);

    const pos = new THREE.Vector3();
    if (parentWorld) pos.copy(parentWorld);
    pos.add(offset);

    const q = pose.bones[bone];
    const local = new THREE.Quaternion();
    if (q) local.set(q[0], q[1], q[2], q[3]);

    const inherited = parentQuat || new THREE.Quaternion();
    quats.set(bone, inherited.clone().multiply(local));
    world.set(bone, pos);
  }
  return world;
}

/**
 * Draw one pose as an SVG stick figure.
 *
 * Front view, so X is horizontal and Y vertical. A side or three-quarter view
 * would need a camera, and this page deliberately has no runtime.
 */
function renderFigure(poseId) {
  const pose = findPoseById(poseId);
  if (!pose) return "";

  const world = poseWorldPositions(pose);

  // Fit the figure to the frame with a little margin, so a seated or kneeling
  // pose is not cropped and a T-pose does not touch the edges.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const bone of DRAWABLE) {
    const p = world.get(bone);
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }

  const w = 220;
  const h = 300;
  const pad = 22;
  const spanX = Math.max(maxX - minX, 0.3);
  const spanY = Math.max(maxY - minY, 0.6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offsetX = (w - spanX * scale) / 2 - minX * scale;
  const offsetY = h - pad + minY * scale;

  const project = function (p) {
    return [p.x * scale + offsetX, offsetY - p.y * scale];
  };

  const lines = CHAINS.map(function (chain) {
    const a = world.get(chain[0]);
    const b = world.get(chain[1]);
    if (!a || !b) return "";
    const pa = project(a);
    const pb = project(b);
    return (
      '<line x1="' + pa[0].toFixed(1) + '" y1="' + pa[1].toFixed(1) +
      '" x2="' + pb[0].toFixed(1) + '" y2="' + pb[1].toFixed(1) + '" />'
    );
  }).join("");

  const dots = DRAWABLE.map(function (bone) {
    const p = world.get(bone);
    if (!p) return "";
    const q = project(p);
    return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="2.6" />';
  }).join("");

  return (
    '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' +
    escapeHtml(pose.name) + '">' +
    '<g class="limbs">' + lines + "</g>" +
    '<g class="joints">' + dots + "</g>" +
    "</svg>"
  );
}

const CSS = [
  ":root { color-scheme: dark; }",
  "body { margin: 0; padding: 3rem 1.5rem; background: #0f1115; color: #e7e9ee; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }",
  "main { max-width: 68rem; margin: 0 auto; }",
  "h1 { font-size: clamp(1.9rem, 5vw, 2.8rem); margin: 0 0 .5rem; letter-spacing: -0.02em; }",
  ".lede { font-size: 1.1rem; color: #a8b0c0; max-width: 44rem; margin: 0 0 2.5rem; }",
  ".badges { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 2.5rem; padding: 0; list-style: none; }",
  ".badges li { padding: .35rem .7rem; border: 1px solid #2a2f3a; border-radius: 999px; font-size: .85rem; color: #c3cad8; }",
  ".grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }",
  "figure { margin: 0; border: 1px solid #222836; border-radius: 12px; overflow: hidden; background: #151922; }",
  ".frame { background: radial-gradient(circle at 50% 30%, #1b2130, #101319); padding: .5rem; }",
  "svg { width: 100%; height: auto; display: block; }",
  ".limbs line { stroke: #4fd1e0; stroke-width: 2.4; stroke-linecap: round; }",
  ".joints circle { fill: #ff5c7a; }",
  "figcaption { display: flex; flex-direction: column; gap: .2rem; padding: .8rem 1rem 1rem; }",
  "figcaption span { color: #8b93a3; font-size: .85rem; }",
  ".cta { display: inline-block; margin-top: 1rem; padding: .65rem 1.1rem; border-radius: 8px; background: #4fd1e0; color: #08111a; font-weight: 600; text-decoration: none; }",
  "footer { margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid #222836; color: #8b93a3; font-size: .9rem; }",
  "a { color: #4fd1e0; }",
].join("\n  ");

function build() {
  // A showcase id that does not exist renders an empty card, which looks like a
  // styling bug rather than a typo. Fail instead.
  for (const item of SHOWCASE) {
    if (!findPoseById(item.pose)) {
      throw new Error("demo: showcase pose not found: " + item.pose);
    }
  }

  const cards = SHOWCASE.map(function (item) {
    const entry = findPoseById(item.pose);
    return (
      "<figure>" +
      '<div class="frame">' + renderFigure(item.pose) + "</div>" +
      "<figcaption><strong>" +
      escapeHtml(entry ? entry.name : item.pose) +
      "</strong><span>" + escapeHtml(item.caption) +
      "</span></figcaption></figure>"
    );
  }).join("");

  const badges = [
    "MIT licensed",
    "No account",
    "Works offline",
    "No telemetry",
    POSE_LIBRARY.length + " authored poses + 1,200 generated",
    "268 scenes",
  ].map(function (b) { return "    <li>" + escapeHtml(b) + "</li>"; }).join("\n");

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Poseify — free offline pose reference</title>",
    '<meta name="description" content="A free, open-source, offline 3D pose reference tool. No account, no network, no cost." />',
    "<style>",
    "  " + CSS,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "  <h1>Poseify</h1>",
    '  <p class="lede">',
    "    A free, open-source 3D pose reference tool for artists. Load a rigged",
    "    humanoid, pose it with forward or inverse kinematics, stage it with props,",
    "    and export reference images. It runs entirely in your browser: no account,",
    "    no server, and nothing you make ever leaves your machine.",
    "  </p>",
    '  <ul class="badges">',
    badges,
    "  </ul>",
    '  <div class="grid">',
    cards,
    "  </div>",
    '  <p><a class="cta" href="../">Open Poseify</a></p>',
    "  <footer>",
    "    Figures drawn with the app's own rig contract and forward kinematics.",
    "    Poseify is MIT licensed. See <code>ATTRIBUTION.md</code> for third-party",
    "    software and data.",
    "  </footer>",
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "index.html"), html, "utf8");
  console.log("poses showcased: " + SHOWCASE.length);
  console.log("written:         " + join(OUT, "index.html"));
}

build();
