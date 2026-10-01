import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import {
  ALL_BONES,
  BODY_BONES,
  HAND_BONES,
  HIP_BONE,
  IK_CHAINS,
  RIG_PARENTS,
  type BodyBoneName,
} from "../rig/RigContract";
import { retargetSkeleton, type RetargetResult } from "../rig/Retargeter";
import { gizmoSizeFor, type ModelLoadConfig } from "../models/ModelLoadConfig";

export type BoneRotation = [number, number, number, number];

export interface PosedBone {
  rotation: BoneRotation;
}

export type PoseData = Record<string, BoneRotation>;

/**
 * A rigged humanoid normalised onto the Poseify rig contract.
 *
 * Owns FK posing (rotate a joint, children follow), bone selection state, and
 * CCD IK for hand/foot chains. All public bone addressing uses contract names,
 * never source bone names, so posing code stays model-agnostic.
 */
export class PosableSkeleton {
  readonly root: THREE.Object3D;
  readonly config: ModelLoadConfig;
  readonly retarget: RetargetResult;

  // contractName -> bone. The only addressable surface for posing.
  readonly bones: Map<string, THREE.Bone> = new Map();

  // Local rotation authored per bone, as [x,y,z,w]. Source of truth.
  private readonly rotations: PoseData = {};

  private readonly restQuaternions = new Map<string, THREE.Quaternion>();
  // One solver per chain: CCDIKSolver.update() solves every chain it holds,
  // so a single shared solver would drag the opposite limb and both feet
  // along with the effector being dragged.
  private readonly ikSolvers = new Map<string, CCDIKSolver>();
  private ikEnabled = false;
  private selectedBone: string | null = null;
  // Target proxies live under the scene root so CCDIKSolver can read their
  // matrixWorld, exactly as the solver expects for `ik.target`.
  private readonly ikTargets = new Map<string, THREE.Bone>();
  // Bone name -> index in the solver's skeleton.bones array.
  private readonly solverBoneIndex = new Map<string, number>();

  constructor(
    root: THREE.Object3D,
    config: ModelLoadConfig,
    options: {
      requireHands?: boolean;
      /**
       * Bind the finger bones when the model has them, without requiring them.
       *
       * `requireHands` is all-or-nothing: a model missing any finger bone
       * resolves only the 22 core bones and the hand poses, hand-pose export
       * and per-limb finger mirroring all silently do nothing. Setting this
       * instead asks the retargeter to look for the full 62 while still
       * validating against the core contract, so a handless model (the horse,
       * the mermaids) loads and poses fine and simply has no fingers.
       */
      bindHands?: boolean;
      retarget?: RetargetResult;
      /**
       * Skip IK chain setup. CCDIKSolver needs a SkinnedMesh, so a bone-only
       * rig (pose thumbnails, FK-only previews) must opt out rather than
       * throw.
       */
      enableIK?: boolean;
    } = {},
  ) {
    this.root = root;
    this.config = config;

    const retarget =
      options.retarget ??
      retargetSkeleton(root, {
        requireHands: options.requireHands ?? false,
        bindFingers: options.bindHands ?? false,
      });
    this.retarget = retarget;

    for (const [contractName, match] of retarget.matches) {
      this.bones.set(contractName, match.bone);
      this.restQuaternions.set(contractName, match.bone.quaternion.clone());
    }

    if (options.enableIK !== false) this.setupIK();
  }

  /** True when the required contract bones resolved. */
  get isValid(): boolean {
    return this.retarget.ok;
  }

  getBone(name: string): THREE.Bone | undefined {
    return this.bones.get(name);
  }

  /** All contract names this skeleton can pose. */
  getBoneNames(): readonly string[] {
    return [...this.bones.keys()];
  }

  get selected(): string | null {
    return this.selectedBone;
  }

  selectBone(name: string | null): void {
    this.selectedBone = name && this.bones.has(name) ? name : null;
  }

  // ------------------------------------------------------------------ FK

  /**
   * Rotate a bone by an incremental rotation in its local space.
   * This is the gizmo path: each drag produces a delta, not an absolute.
   */
  rotateBone(name: string, delta: THREE.Euler): boolean {
    const bone = this.bones.get(name);
    if (!bone) return false;
    const current = this.rotations[name];
    const base = current
      ? new THREE.Quaternion(current[0], current[1], current[2], current[3])
      : new THREE.Quaternion();
    base.multiply(new THREE.Quaternion().setFromEuler(delta));
    this.setBoneRotation(name, base);
    return true;
  }

  /** Set an absolute local rotation (euler radians) for a bone. */
  setBoneRotationEuler(name: string, euler: THREE.Euler): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    this.setBoneRotation(name, new THREE.Quaternion().setFromEuler(euler));
  }

  /** Set an absolute local quaternion for a bone. Primary pose-transfer path. */
  setBoneRotation(name: string, q: THREE.Quaternion): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    this.rotations[name] = [q.x, q.y, q.z, q.w];
    // Apply the authored rotation ON TOP OF the model's bind orientation rather
    // than replacing it. Every model sharing the rig contract can have a
    // different rest orientation (a T-pose FBX, a differently-posed rig), and
    // overwriting the bind quaternion would make the same pose land differently
    // on each one, which is exactly what pose transfer must not do.
    const bind = this.restQuaternions.get(name) ?? new THREE.Quaternion();
    bone.quaternion.copy(bind).multiply(q);
    this.applyDown(name);
  }

  /** Propagate a bone's transform to all descendants, parent-first. */
  private applyDown(name: string): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    bone.updateMatrixWorld(true);
    for (const child of bone.children) {
      if (child instanceof THREE.Bone) child.updateMatrixWorld(true);
    }
  }

  getBoneQuaternion(name: string): THREE.Quaternion | null {
    // The authored rotation, not the composed world-local one: callers compare
    // these across models, and the bind orientation is per-model.
    const authored = this.rotations[name];
    return authored ? new THREE.Quaternion(...authored) : null;
  }

  getBoneEuler(name: string): THREE.Euler | null {
    const bone = this.bones.get(name);
    return bone
      ? new THREE.Euler().setFromQuaternion(bone.quaternion, "XYZ")
      : null;
  }

  /** Snapshot every authored rotation. Basis for save/pose-copy. */
  getPose(): PoseData {
    const out: PoseData = {};
    for (const [name, r] of Object.entries(this.rotations)) {
      out[name] = [r[0], r[1], r[2], r[3]];
    }
    return out;
  }

  /** Reset one bone to its bind rotation. */
  resetBone(name: string): void {
    const bone = this.bones.get(name);
    if (!bone) return;
    bone.quaternion.copy(this.restQuaternions.get(name) ?? new THREE.Quaternion());
    delete this.rotations[name];
    this.applyDown(name);
  }

  resetPose(): void {
    for (const name of Object.keys(this.rotations)) {
      this.resetBone(name);
    }
  }

  /**
   * Apply a full pose record. Bones absent from the pose reset to bind, so
   * switching poses never leaves stale rotations behind.
   * This is the pose-transfer entry point.
   */
  applyPose(pose: PoseData, rootOffset?: [number, number, number]): void {
    const bindRoot = this.rootOffset.copy(this.bones.get(HIP_BONE)?.position ?? new THREE.Vector3());
    this.resetPose();
    for (const [name, r] of Object.entries(pose)) {
      if (!this.bones.has(name)) continue;
      this.setBoneRotation(name, new THREE.Quaternion(r[0], r[1], r[2], r[3]));
    }

    // The rig has no pelvis bone and Hips is the skeleton root, so rotating it
    // spins the figure without lowering it. Seated and kneeling poses pass an
    // explicit root offset, which is applied as a translation on the root bone
    // and folded back into the bind offset so repeated poses do not accumulate.
    const hips = this.bones.get(HIP_BONE);
    if (hips) {
      const offset = rootOffset
        ? new THREE.Vector3(...rootOffset)
        : new THREE.Vector3(0, 0, 0);
      hips.position.copy(bindRoot).add(offset);
      this.applyDown(HIP_BONE);
    }
  }

  /**
   * Apply a hand pose to the finger bones only, leaving the body untouched.
   *
   * The separate entry point is the point of the whole subsystem: "paste hand
   * only" must not disturb a body pose the artist has already built. Returns the
   * bones it could not apply so the caller can say why a model without fingers
   * did nothing, rather than failing silently.
   */
  applyHandPose(hand: PoseData): string[] {
    const missing: string[] = [];
    for (const [name, r] of Object.entries(hand)) {
      if (!this.bones.has(name)) {
        missing.push(name);
        continue;
      }
      this.setBoneRotation(name, new THREE.Quaternion(r[0], r[1], r[2], r[3]));
    }
    return missing;
  }

  /**
   * Snapshot just the finger bones, for Copy Pose (And Hand Pose).
   *
   * Returning the hands separately from getPose() is what keeps the two
   * channels independent: pasting the body back cannot disturb the hands, and
   * vice versa.
   */
  getHandPose(): PoseData {
    const handSet = new Set(HAND_BONES);
    const out: PoseData = {};
    for (const [name, r] of Object.entries(this.rotations)) {
      if (handSet.has(name)) out[name] = [r[0], r[1], r[2], r[3]];
    }
    return out;
  }

  /** Reset every finger bone to bind, leaving the body pose alone. */
  resetHandPose(): void {
    for (const name of Object.keys(this.rotations)) {
      if (HAND_BONES.includes(name)) this.resetBone(name);
    }
  }
  private readonly rootOffset = new THREE.Vector3();

  // ------------------------------------------------------------------ IK

  private setupIK(): void {
    // The solver addresses bones by index into SkinnedMesh.skeleton.bones, so
    // it can only operate on a skinned mesh. Non-skinned rigs (procedural
    // skeletons in tests, external FBX without skin) get FK only.
    const mesh = findSkinnedMesh(this.root);
    const chains = this.resolveIKChains();
    if (!mesh || chains.length === 0) {
      this.ikEnabled = false;
      throw new Error(
        "PosableSkeleton: IK requires a SkinnedMesh with the full IK chains.",
      );
    }

    const skeletonBones = mesh.skeleton.bones;
    skeletonBones.forEach((b, i) => this.solverBoneIndex.set(b.name, i));

    for (const chain of chains) {
      const effector = chain[chain.length - 1];
      // The solver reads its goal from bones[ik.target], so the goal must be a
      // real bone in skeleton.bones.
      const target = new THREE.Bone();
      target.name = `${effector.name}_IKTarget`;
      this.root.add(target);
      const targetIndex = skeletonBones.length;
      skeletonBones.push(target);
      this.solverBoneIndex.set(target.name, targetIndex);
      this.ikTargets.set(effector.name, target);

      // links are the rotating joints, walked from the one nearest the
      // effector outwards. The effector itself is not a link, and the solver
      // asserts each link's parent-child continuity, so drop the effector and
      // reverse the parent->child chain.
      const links = [];
      for (let i = chain.length - 2; i >= 0; i--) {
        const index = this.solverBoneIndex.get(chain[i].name);
        if (index === undefined) continue;
        links.push({ index });
      }

      this.ikSolvers.set(
        effector.name,
        new CCDIKSolver(mesh, [{
            target: targetIndex,
            effector: this.solverBoneIndex.get(effector.name)!,
            links,
            iteration: 24,
            minAngle: 0,
            maxAngle: Math.PI,
          }]),
      );
    }

    // Appending bones leaves boneMatrices too short (it is sized at
    // construction), which throws inside Skeleton.update() and silently drops
    // the whole figure from the render. Reallocate and recompute.
    mesh.skeleton.boneMatrices = new Float32Array(skeletonBones.length * 16);
    for (let i = 0; i < skeletonBones.length; i++) {
      mesh.skeleton.boneInverses[i] =
        mesh.skeleton.boneInverses[i] ?? new THREE.Matrix4();
    }
    mesh.skeleton.boneInverses.length = skeletonBones.length;
    mesh.skeleton.calculateInverses();

    this.ikEnabled = true;
  }

  private resolveIKChains(): THREE.Bone[][] {
    const chains: THREE.Bone[][] = [];
    // IK_CHAINS is effector-first; CCD wants parent -> child.
    for (const names of Object.values(IK_CHAINS)) {
      const ordered = [...names].reverse();
      const bones = ordered
        .map((n) => this.bones.get(n))
        .filter((b): b is THREE.Bone => b !== undefined);
      if (bones.length === ordered.length) chains.push(bones);
    }
    return chains;
  }

  setIKEnabled(enabled: boolean): void {
    this.ikEnabled = enabled;
  }

  get ikIsEnabled(): boolean {
    return this.ikEnabled;
  }

  /**
   * Solve the IK chain so `endEffector` reaches worldTarget, then commit the
   * solved rotations into the authored pose so FK editing, pose export, and
   * pose transfer all observe the same state.
   */
  solveIK(endEffector: string, worldTarget: THREE.Vector3): boolean {
    const effector = this.bones.get(endEffector);
    const target = this.ikTargets.get(endEffector);
    const solver = this.ikSolvers.get(endEffector);
    if (!effector || !target || !solver || !this.ikEnabled) return false;

    this.root.updateMatrixWorld(true);
    target.position.copy(target.parent!.worldToLocal(worldTarget.clone()));
    target.updateMatrixWorld(true);

    solver.update();

    // Commit the solved local rotations into the authored pose.
    for (const [name, bone] of this.bones) {
      this.rotations[name] = [
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w,
      ];
    }
    this.root.updateMatrixWorld(true);
    return true;
  }

  /** World position of a bone under the current pose. */
  getWorldPosition(
    name: string,
    out = new THREE.Vector3(),
  ): THREE.Vector3 | null {
    const bone = this.bones.get(name);
    if (!bone) return null;
    this.root.updateMatrixWorld(true);
    return bone.getWorldPosition(out);
  }

  /** Gizmo radius for a bone, honouring per-model tuning. */
  gizmoSize(name: string): number {
    return gizmoSizeFor(this.config, name);
  }

  get presentBodyBones(): BodyBoneName[] {
    return BODY_BONES.filter((n) => this.bones.has(n)) as BodyBoneName[];
  }

  get presentHandBones(): string[] {
    return HAND_BONES.filter((n) => this.bones.has(n));
  }

  /** Exposed for the OpenPose exporter and debug overlays. */
  get allContractBones(): readonly string[] {
    return ALL_BONES;
  }

  /** Contract parents, re-exported so callers need a single import. */
  static get parents(): Readonly<Record<string, string | null>> {
    return RIG_PARENTS;
  }
}

// CCDIKSolver operates on a SkinnedMesh. Find the first one under a root.
function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && o instanceof THREE.SkinnedMesh) found = o;
  });
  return found;
}

