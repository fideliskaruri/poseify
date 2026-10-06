// Attaching a prop to a joint.
//
// a typical pose reference tool calls this attach/detach to joint: select a prop, press Attach,
// click a joint, and the prop becomes a child of that bone so it follows the
// figure through every pose change. This file holds the transform maths; the
// mode, the highlight and the button live in the composable and the view.
//
// Parenting, not copying transforms, is the whole point. Once the prop is a
// child of the bone, rotating the joint carries the prop for free, and there
// is nothing to keep in sync per frame.

import * as THREE from "three";
import type { PropAttach } from "../scene/Scene";

/**
 * The prop's position expressed in the bone's local space.
 *
 * Captured at attach time so the prop does not jump on the frame it is pinned:
 * the artist aims at a joint, clicks, and the prop stays where it is.
 */
export function localOffsetInBone(
  propRoot: THREE.Object3D,
  bone: THREE.Bone,
): [number, number, number] {
  propRoot.updateMatrixWorld(true);
  bone.updateMatrixWorld(true);
  const world = propRoot.getWorldPosition(new THREE.Vector3());
  const local = bone.worldToLocal(world.clone());
  return [local.x, local.y, local.z];
}

/**
 * Pin a prop to a bone.
 *
 * The prop is re-parented to the bone and given the captured local offset, so
 * it keeps both its world position and its own rotation and scale. Baking the
 * bone's rotation into the prop instead would make a sword on a rotated arm
 * snap as the arm moves.
 */
export function attachPropToBone(
  propRoot: THREE.Object3D,
  bone: THREE.Bone,
  offset?: [number, number, number],
): PropAttach {
  propRoot.updateMatrixWorld(true);
  bone.updateMatrixWorld(true);
  const attachOffset = offset ?? localOffsetInBone(propRoot, bone);

  // Preserve the prop's own world transform across the re-parent, then express
  // it in bone space. Decomposing against the bone's inverse is what stops the
  // prop teleporting to the joint origin on the frame it is pinned.
  const worldMatrix = propRoot.matrixWorld.clone();
  const boneInverse = bone.matrixWorld.clone().invert();
  const localMatrix = boneInverse.multiply(worldMatrix);
  localMatrix.decompose(propRoot.position, propRoot.quaternion, propRoot.scale);

  bone.add(propRoot);
  propRoot.position.fromArray(attachOffset);
  propRoot.updateMatrixWorld(true);
  return { bone: bone.name, offset: attachOffset };
}

/**
 * Pull a prop back out of the rig and leave it standing in the world.
 *
 * Re-parents to whatever held the bone, so a prop nested inside a figure's
 * root lands back in the scene rather than being dropped at the origin.
 * Returns false when the prop was not on a bone, so the caller can tell the
 * difference between "detached" and "was never attached".
 */
export function detachPropFromBone(propRoot: THREE.Object3D): boolean {
  const parent = propRoot.parent;
  if (!parent || !(parent as THREE.Object3D).isBone) return false;
  propRoot.updateMatrixWorld(true);

  // The prop's world matrix is the thing worth keeping. Where it goes next is
  // the bone's own parent, so a prop inside a figure root stays inside it.
  const next = parent.parent;
  const worldMatrix = propRoot.matrixWorld.clone();
  parent.remove(propRoot);

  if (next) {
    next.updateMatrixWorld(true);
    const localMatrix = next
      .matrixWorld.clone()
      .invert()
      .multiply(worldMatrix);
    localMatrix.decompose(propRoot.position, propRoot.quaternion, propRoot.scale);
    next.add(propRoot);
  } else {
    const decomposed = new THREE.Matrix4();
    decomposed.copy(worldMatrix);
    decomposed.decompose(propRoot.position, propRoot.quaternion, propRoot.scale);
  }
  propRoot.updateMatrixWorld(true);
  return true;
}

/**
 * Re-apply a saved attach, used when a scene loads.
 *
 * Reports false when the model does not have the bone, so the UI can name the
 * prop that fell loose instead of silently floating.
 */
export function applySavedAttach(
  propRoot: THREE.Object3D,
  bone: THREE.Bone | undefined,
  attach: PropAttach,
): boolean {
  if (!bone) return false;
  bone.add(propRoot);
  propRoot.position.fromArray(attach.offset);
  propRoot.updateMatrixWorld(true);
  return true;
}
