// Pose thumbnails.
//
// Rendered offscreen from a rig built on the same contract the app poses, so a
// thumbnail always matches what applying that pose actually does. Cached per
// pose id and generated lazily, so opening the picker costs nothing until the
// grid is actually shown.

import * as THREE from "three";
import { RIG_PARENTS } from "../rig/RigContract";
import { PosableSkeleton } from "../posing/PosableSkeleton";
import { DEFAULT_LOAD_CONFIG } from "../models/ModelLoadConfig";
import type { Pose } from "./Pose";

const THUMB_SIZE = 128;

// Rest offsets for a ~1.75 m T-pose, mirroring the app's own fixture data.
const REST: Record<string, [number, number, number]> = {
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

function restOf(name: string): THREE.Vector3 {
  const base = REST[name] ?? [0, 0.5, 0];
  return new THREE.Vector3(
    name.startsWith("Right") ? -base[0] : base[0],
    base[1],
    base[2],
  );
}

/** Segments drawn as the thumbnail figure, keyed by contract bone pairs. */
const SEGMENTS: { from: string; to: string; radius: number }[] = [
  { from: "Hips", to: "Spine2", radius: 0.055 },
  { from: "Spine2", to: "Head", radius: 0.04 },
  { from: "LeftShoulder", to: "LeftForeArm", radius: 0.032 },
  { from: "LeftForeArm", to: "LeftHand", radius: 0.028 },
  { from: "RightShoulder", to: "RightForeArm", radius: 0.032 },
  { from: "RightForeArm", to: "RightHand", radius: 0.028 },
  { from: "LeftUpLeg", to: "LeftLeg", radius: 0.042 },
  { from: "LeftLeg", to: "LeftFoot", radius: 0.034 },
  { from: "RightUpLeg", to: "RightLeg", radius: 0.042 },
  { from: "RightLeg", to: "RightFoot", radius: 0.034 },
];

export class PoseThumbnailer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private skeleton: PosableSkeleton | null = null;
  private readonly cache = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string | null>>();

  private init(): boolean {
    if (this.renderer) return true;
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      return false;
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2, 4, 3);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

    // Build a contract rig and pose it through the real PosableSkeleton, so
    // the thumbnail uses exactly the code path the app uses.
    const bones = new Map<string, THREE.Bone>();
    const childrenOf = (name: string): string[] =>
      Object.entries(RIG_PARENTS)
        .filter(([, p]) => p === name)
        .map(([c]) => c);
    const visit = (name: string): void => {
      const bone = new THREE.Bone();
      bone.name = name;
      bones.set(name, bone);
      for (const c of childrenOf(name)) visit(c);
    };
    visit("Hips");
    for (const [name, bone] of bones) {
      const parentName = RIG_PARENTS[name];
      const parent = parentName ? bones.get(parentName) : undefined;
      const rest = restOf(name);
      if (parent) {
        bone.position.copy(rest.sub(restOf(parentName)));
        parent.add(bone);
      } else {
        bone.position.copy(rest);
      }
    }

    const root = new THREE.Group();
    root.add(bones.get("Hips")!);
    this.scene.add(root);

    // Capsules approximating the body, rebuilt per thumbnail from bone
    // positions so the silhouette follows the pose.
    const material = new THREE.MeshBasicMaterial({
      color: 0xc9ced6,
      transparent: true,
      opacity: 0.94,
    });
    for (const seg of SEGMENTS) {
      const geom = new THREE.CylinderGeometry(1, 1, 1, 7);
      const mesh = new THREE.Mesh(geom, material);
      mesh.name = `seg_${seg.from}_${seg.to}`;
      mesh.userData.segment = seg;
      this.scene.add(mesh);
    }

    this.skeleton = new PosableSkeleton(root, {
      ...DEFAULT_LOAD_CONFIG,
      id: "pose-thumb",
      name: "pose-thumb",
    },
    // Thumbnails only need forward kinematics, and this rig has no
    // SkinnedMesh for CCDIKSolver to operate on.
    { enableIK: false });
    return true;
  }

  /** Reposition the capsule meshes to match the current pose. */
  private updateSegments(): void {
    if (!this.scene || !this.skeleton) return;
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const quat = new THREE.Quaternion();

    for (const child of this.scene.children) {
      const seg = child.userData?.segment as
        | { from: string; to: string; radius: number }
        | undefined;
      if (!seg) continue;
      const a = this.skeleton.getBone(seg.from);
      const b = this.skeleton.getBone(seg.to);
      if (!a || !b) continue;
      a.getWorldPosition(va);
      b.getWorldPosition(vb);
      dir.subVectors(vb, va);
      const len = Math.max(dir.length(), 1e-3);
      quat.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      mid.addVectors(va, vb).multiplyScalar(0.5);
      child.position.copy(mid);
      child.quaternion.copy(quat);
      child.scale.set(seg.radius, len, seg.radius);
    }
  }

  /** Render a pose thumbnail, or null when WebGL is unavailable. */
  async thumbnail(pose: Pose): Promise<string | null> {
    const cached = this.cache.get(pose.id);
    if (cached !== undefined) return cached;

    // De-duplicate concurrent requests for the same pose.
    const pending = this.inFlight.get(pose.id);
    if (pending) return pending;

    const work = (async (): Promise<string | null> => {
      if (!this.init() || !this.renderer || !this.scene || !this.camera) {
        return null;
      }
      if (!this.skeleton) return null;

      try {
        this.skeleton.applyPose(pose.bones);
        this.skeleton.root.updateMatrixWorld(true);
        this.updateSegments();

        // Fixed framing so every thumbnail is directly comparable.
        this.camera.position.set(0, 1.0, 3.5);
        this.camera.lookAt(0, 0.95, 0);
        this.camera.updateProjectionMatrix();

        this.renderer.render(this.scene, this.camera);
        const url = this.renderer.domElement.toDataURL("image/png");
        this.cache.set(pose.id, url);
        return url;
      } catch {
        return null;
      } finally {
        this.inFlight.delete(pose.id);
      }
    })();

    this.inFlight.set(pose.id, work);
    return work;
  }

  /** Warm the cache for a set of poses. */
  async prime(poses: readonly Pose[]): Promise<void> {
    if (typeof document === "undefined") return;
    for (const pose of poses) await this.thumbnail(pose);
  }
}

let shared: PoseThumbnailer | null = null;

export function poseThumbnailer(): PoseThumbnailer {
  if (!shared) shared = new PoseThumbnailer();
  return shared;
}
