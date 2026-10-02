// Bone selection and transform gizmo.
//
// Clicking near a joint selects it; a TransformControls gizmo then rotates it.
// Rotation-only by default because that is what posing needs, and translating
// a joint would break the rig contract's bone lengths.

import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PosableSkeleton } from "./PosableSkeleton";

export type InteractionMode = "fk" | "ik";

export interface BonePickOptions {
  pickRadius?: number;
}

export const DEFAULT_PICK_RADIUS = 0.06;

/**
 * Raycasts against bones and drives a TransformControls gizmo.
 * Owns no Vue state; the host component subscribes to callbacks.
 */
export class PoseController {
  mode: InteractionMode = "fk";

  onSelect: ((boneName: string | null) => void) | null = null;
  onPoseChange: ((boneName: string) => void) | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly gizmo: TransformControls;
  private readonly gizmoHelper: THREE.Object3D;
  private readonly domElement: HTMLElement;
  private readonly camera: THREE.Camera;
  private skeleton: PosableSkeleton | null = null;
  private pickRadius: number;
  private isDragging = false;
  private readonly pointerDown = new THREE.Vector2();

  constructor(
    domElement: HTMLElement,
    camera: THREE.Camera,
    orbit: OrbitControls,
    options: BonePickOptions = {},
  ) {
    this.domElement = domElement;
    this.camera = camera;
    this.pickRadius = options.pickRadius ?? DEFAULT_PICK_RADIUS;

    this.gizmo = new TransformControls(camera, domElement);
    this.gizmo.setMode("rotate");
    this.gizmo.setSpace("local");
    this.gizmo.size = 0.75;
    this.gizmoHelper = this.gizmo.getHelper();
    this.gizmoHelper.visible = false;

    this.gizmo.addEventListener("dragging-changed", (event) => {
      const dragging = (event as unknown as { value: boolean }).value;
      this.isDragging = dragging;
      orbit.enabled = !dragging;
    });
    this.gizmo.addEventListener("objectChange", () => {
      const name = this.skeleton?.selected;
      if (name) this.onPoseChange?.(name);
    });

    this.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.domElement.addEventListener("pointerup", this.handlePointerUp);
  }

  /** The object that must be added to the scene for the gizmo to render. */
  get helper(): THREE.Object3D {
    return this.gizmoHelper;
  }

  get attachedSkeleton(): PosableSkeleton | null {
    return this.skeleton;
  }

  /** Attach a skeleton. Passing null clears selection and hides the gizmo. */
  setSkeleton(skeleton: PosableSkeleton | null): void {
    this.skeleton = skeleton;
    this.detachGizmo();
    skeleton?.selectBone(null);
    this.onSelect?.(null);
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
    // IK drags the end effector itself, so the rotate gizmo is FK-only.
    if (mode === "ik") this.detachGizmo();
    this.skeleton?.setIKEnabled(mode === "ik");
  }

  setPickRadius(radius: number): void {
    this.pickRadius = radius;
  }

  selectBone(name: string | null): void {
    if (!this.skeleton) return;
    this.skeleton.selectBone(name);
    if (name) {
      const bone = this.skeleton.getBone(name);
      if (bone) {
        this.gizmo.attach(bone);
        this.gizmoHelper.visible = this.mode === "fk";
        // Per-model gizmo sizing keeps chibi and brute both controllable.
        this.gizmo.size = THREE.MathUtils.clamp(
          this.skeleton.gizmoSize(name) / 4,
          0.35,
          2.2,
        );
      }
    } else {
      this.detachGizmo();
    }
    this.onSelect?.(name);
  }

  /** Move an IK end effector to a world position. */
  moveEffector(name: string, worldTarget: THREE.Vector3): boolean {
    return this.skeleton?.solveIK(name, worldTarget) ?? false;
  }

  private detachGizmo(): void {
    this.gizmo.detach();
    this.gizmoHelper.visible = false;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDown.set(e.clientX, e.clientY);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    // Ignore interactions that were really gizmo drags or camera orbit drags.
    if (this.isDragging) return;
    if (this.pointerDown.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) {
      return;
    }
    // Attach mode owns the click: it needs the joint the user pointed at, not
    // a bone selection. Returning true means "handled, do not also select".
    if (this.onViewportClick?.(e) === true) return;
    this.selectBone(this.pickBone(e));
  };

  /**
   * Host hook for viewport clicks.
   *
   * Attach to Joint installs this so a click in the viewport picks a joint
   * rather than selecting a bone for the FK gizmo. Return true to consume the
   * event.
   */
  onViewportClick: ((event: PointerEvent) => boolean | void) | null = null;

  /** Nearest contract bone to the pointer ray, or null. */
  private pickBone(e: PointerEvent): string | null {
    if (!this.skeleton) return null;
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let best: { name: string; distance: number } | null = null;
    const worldPos = new THREE.Vector3();
    const projected = new THREE.Vector3();

    for (const name of this.skeleton.getBoneNames()) {
      const bone = this.skeleton.getBone(name);
      if (!bone) continue;
      bone.getWorldPosition(worldPos);
      projected.copy(worldPos).project(this.camera);
      if (projected.z > 1) continue;
      const distance = this.raycaster.ray.distanceToPoint(worldPos);
      // Screen-ish tolerance so picking feels the same at any zoom level.
      const tolerance = this.pickRadius * (distance / 10 + 0.5);
      if (distance < tolerance && (!best || distance < best.distance)) {
        best = { name, distance };
      }
    }
    return best?.name ?? null;
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.gizmo.detach();
    // three 0.169: TransformControls extends Controls, not Object3D, so its own
    // dispose() calls a missing this.traverse. The helper is the Object3D that
    // actually owns the gizmo geometry and materials, so free those by hand.
    // disconnect() is the DOM-listener half of dispose() and is safe to call.
    this.gizmo.disconnect();
    this.gizmoHelper.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }
}
