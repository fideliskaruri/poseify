// Reference-image and OBJ export.
//
// Drives the five render passes from one camera and one pose, so every export
// lines up with the others and with what the artist framed on screen.

import * as THREE from "three";
import type { PosableSkeleton } from "../posing/PosableSkeleton";
import {
  CannyPass,
  PASS_LABELS,
  RENDER_PASSES,
  createDepthMaterial,
  createNormalMaterial,
  hideAll,
  type ExportOptions,
  type RenderPass,
} from "./RenderPasses";
import { COCO18_LIMBS, extractCoco18, type Keypoint2D } from "./OpenPose";
import { exportObj } from "./ObjExport";

export interface ExportTarget {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  skeleton: PosableSkeleton;
  // Grid, gizmo and other scene furniture to hide during export.
  helpers: THREE.Object3D[];
}

export interface ExportResult {
  pass: RenderPass;
  width: number;
  height: number;
  dataUrl: string;
  filename: string;
}

export interface ExportRequest {
  passes: readonly RenderPass[];
  options: ExportOptions;
  name?: string;
}

function fileBase(name: string | undefined): string {
  const cleaned = (name ?? "poseify").trim() || "poseify";
  return cleaned.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-");
}

/**
 * Paint an OpenPose-style stick figure onto a canvas.
 * Exported so the drawing logic can be tested without a GL context.
 */
export function drawOpenPose2D(
  canvas: HTMLCanvasElement,
  keypoints: Keypoint2D[],
  width: number,
  height: number,
  transparent = false,
): void {
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  if (!transparent) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  }

  const px = (k: Keypoint2D): [number, number] => [k.x * width, k.y * height];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = Math.max(2, Math.round(width / 340));
  ctx.beginPath();
  for (const [a, b] of COCO18_LIMBS) {
    const from = keypoints[a];
    const to = keypoints[b];
    if (!from || !to) continue;
    const [x1, y1] = px(from);
    const [x2, y2] = px(to);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  const radius = Math.max(3, Math.round(width / 300));
  ctx.fillStyle = "#ff2d55";
  for (const k of keypoints) {
    const [x, y] = px(k);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderOpenPose(
  target: ExportTarget,
  width: number,
  height: number,
  transparent: boolean,
): string {
  const keypoints = extractCoco18(target.skeleton, target.camera);
  // The renderer's canvas already has a WebGL context, and a canvas can only
  // ever have one context type, so getContext("2d") on it returns null and
  // nothing would be drawn. The stick figure is therefore painted on its own
  // 2D canvas and read back directly.
  const canvas = document.createElement("canvas");
  drawOpenPose2D(canvas, keypoints, width, height, transparent);
  return canvas.toDataURL("image/png");
}

/**
 * Render one pass to a PNG data URL.
 *
 * The renderer is temporarily resized to the export resolution and restored
 * afterwards, so an export never leaves the viewport in a wrong state.
 */
export function renderPass(
  target: ExportTarget,
  pass: RenderPass,
  options: ExportOptions,
  name?: string,
): ExportResult {
  const { renderer, scene, camera } = target;
  const { width, height, transparent, hideHelpers } = options;

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();
  const previousClearAlpha = renderer.getClearAlpha();
  const previousBackground = scene.background;
  const previousOverride = scene.overrideMaterial;

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  // A transparent export needs a null background, not a black one.
  scene.background = transparent ? null : new THREE.Color(0x14161a);
  renderer.setClearAlpha(transparent ? 0 : 1);

  let canny: CannyPass | null = null;
  let overrideMaterial: THREE.Material | null = null;
  let dataUrl: string | null = null;

  try {
    const restoreHelpers = hideAll(target.helpers, hideHelpers);

    switch (pass) {
      case "regular":
        break;
      case "normals":
        overrideMaterial = createNormalMaterial();
        scene.overrideMaterial = overrideMaterial;
        break;
      case "depth":
        overrideMaterial = createDepthMaterial(camera);
        scene.overrideMaterial = overrideMaterial;
        break;
      case "canny":
        canny = new CannyPass(width, height);
        canny.render({ renderer, scene, camera }, target.helpers);
        break;
      case "openpose":
        dataUrl = renderOpenPose(target, width, height, transparent);
        break;
    }

    // Only the WebGL passes need a scene render. Canny has already drawn its
    // edge image onto the canvas, and re-rendering the scene here would paint
    // over it and make Canny identical to Regular.
    if (pass === "regular" || pass === "normals" || pass === "depth") {
      renderer.render(scene, camera);
    }

    const png = dataUrl ?? renderer.domElement.toDataURL("image/png");
    restoreHelpers();

    return {
      pass,
      width,
      height,
      dataUrl: png,
      filename: `${fileBase(name)}-${PASS_LABELS[pass].toLowerCase()}.png`,
    };
  } finally {
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
    renderer.setClearAlpha(previousClearAlpha);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y, false);
    overrideMaterial?.dispose();
    canny?.dispose();
  }
}

/** Render every requested pass. */
export function exportPasses(
  target: ExportTarget,
  request: ExportRequest,
): ExportResult[] {
  const out: ExportResult[] = [];
  for (const pass of request.passes) {
    out.push(renderPass(target, pass, request.options, request.name));
  }
  return out;
}

export interface ObjExportResult {
  filename: string;
  text: string;
  vertexCount: number;
  faceCount: number;
}

/** Export the posed figure as a Wavefront OBJ. */
export function exportModelObj(
  skeleton: PosableSkeleton,
  name?: string,
): ObjExportResult {
  const text = exportObj(skeleton.root, { name: fileBase(name) });
  return {
    filename: `${fileBase(name)}.obj`,
    text,
    vertexCount: (text.match(/^v /gm) ?? []).length,
    faceCount: (text.match(/^f /gm) ?? []).length,
  };
}

export { RENDER_PASSES, PASS_LABELS };
export type { RenderPass, ExportOptions };
