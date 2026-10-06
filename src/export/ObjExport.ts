// Wavefront OBJ export of a posed figure.
//
// OBJ is the interchange format artists use to bring a pose into Blender or
// ZBrush for sculpting, so the exported mesh must carry the *posed* vertex
// positions, not the rest pose.

import * as THREE from "three";

export interface ObjExportOptions {
  name?: string;
  includeNormals?: boolean;
  includeUvs?: boolean;
  applyWorldTransform?: boolean;
}

/** Weighted blend of bone matrices, matching the GPU skinning formula. */
function accumulateSkinMatrix(
  target: THREE.Matrix4,
  skeleton: THREE.Skeleton,
  skinIndex: THREE.BufferAttribute,
  skinWeight: THREE.BufferAttribute,
  vertex: number,
  bindMatrix: THREE.Matrix4,
  bindMatrixInverse: THREE.Matrix4,
): void {
  target.identity();
  const scratch = new THREE.Matrix4();
  const position = new THREE.Vector3();

  const base = vertex * 4;
  for (let b = 0; b < 4; b++) {
    const weight = skinWeight.getX(base + b);
    if (weight === 0) continue;
    const bone = skeleton.bones[skinIndex.getX(base + b)];
    if (!bone) continue;

    scratch
      .multiplyMatrices(bindMatrix, bone.matrixWorld)
      .multiply(bindMatrixInverse);
    position.setFromMatrixPosition(scratch);

    const e = scratch.elements;
    const t = target.elements;
    t[0] += e[0] * weight;
    t[1] += e[1] * weight;
    t[2] += e[2] * weight;
    t[3] += e[3] * weight;
    t[4] += e[4] * weight;
    t[5] += e[5] * weight;
    t[6] += e[6] * weight;
    t[7] += e[7] * weight;
    t[8] += e[8] * weight;
    t[9] += e[9] * weight;
    t[10] += e[10] * weight;
    t[11] += e[11] * weight;
    t[12] += position.x * weight;
    t[13] += position.y * weight;
    t[14] += position.z * weight;
    t[15] += weight;
  }
}

/**
 * Serialise an Object3D subtree to OBJ text.
 *
 * Skinned meshes are exported through their skeleton so the deformation is
 * baked in: each vertex is transformed by the weighted blend of the bones that
 * influence it, exactly as the GPU computes it.
 */
export function exportObj(
  root: THREE.Object3D,
  options: ObjExportOptions = {},
): string {
  const {
    name = "poseify",
    includeNormals = false,
    includeUvs = false,
    applyWorldTransform = true,
  } = options;

  root.updateMatrixWorld(true);

  const out: string[] = ["# Poseify export", `o ${name}`];
  let vertexOffset = 1;
  let normalOffset = 1;
  let uvOffset = 1;
  const v = new THREE.Vector3();
  const skinMatrix = new THREE.Matrix4();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    // A hidden mesh is not part of what the artist can see, so it is not part
    // of the export. Skipping it here means the whole-scene path and the
    // figure-only path agree about visibility.
    if (!obj.visible) return;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.getAttribute("position");
    if (!geometry || !position) return;

    const skinned = mesh as THREE.SkinnedMesh;
    const skeleton = skinned.isSkinnedMesh ? skinned.skeleton : null;
    const bindMatrix = skinned.bindMatrix ?? new THREE.Matrix4();
    const bindMatrixInverse =
      skinned.bindMatrixInverse ?? new THREE.Matrix4();
    const worldMatrix = applyWorldTransform
      ? mesh.matrixWorld
      : new THREE.Matrix4();

    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");

    const index = geometry.getIndex();
    const faceVertexCount = index ? index.count : position.count;
    const transformed = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);

      if (skeleton && skinIndex && skinWeight) {
        accumulateSkinMatrix(
          skinMatrix,
          skeleton,
          skinIndex,
          skinWeight,
          i,
          bindMatrix,
          bindMatrixInverse,
        );
        v.applyMatrix4(skinMatrix);
      }

      v.applyMatrix4(worldMatrix);
      transformed[i * 3] = v.x;
      transformed[i * 3 + 1] = v.y;
      transformed[i * 3 + 2] = v.z;
    }

    out.push(`o ${mesh.name || name}`);
    for (let i = 0; i < position.count; i++) {
      out.push(
        `v ${transformed[i * 3].toFixed(6)} ${transformed[i * 3 + 1].toFixed(6)} ${transformed[i * 3 + 2].toFixed(6)}`,
      );
    }

    const uv = includeUvs ? geometry.getAttribute("uv") : undefined;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        out.push(`vt ${uv.getX(i).toFixed(6)} ${uv.getY(i).toFixed(6)}`);
      }
    }

    if (includeNormals) {
      const normal = geometry.getAttribute("normal");
      if (normal) {
        for (let i = 0; i < normal.count; i++) {
          out.push(
            `vn ${normal.getX(i)} ${normal.getY(i)} ${normal.getZ(i)}`,
          );
        }
      }
    }

    for (let i = 0; i < faceVertexCount; i += 3) {
      const a = (index ? index.getX(i) : i) + vertexOffset;
      const b = (index ? index.getX(i + 1) : i + 1) + vertexOffset;
      const c = (index ? index.getX(i + 2) : i + 2) + vertexOffset;
      const parts = [a, b, c].map((vi) => {
        const local = vi - vertexOffset;
        let s = `${vi}`;
        if (uv) s += `/${uvOffset + local}`;
        if (includeNormals) s += `/${normalOffset + local}`;
        return s;
      });
      out.push(`f ${parts.join(" ")}`);
    }

    vertexOffset += position.count;
    if (uv) uvOffset += uv.count;
    if (includeNormals) normalOffset += position.count;
  });

  return `${out.join("\n")}\n`;
}

/**
 * Shift one OBJ face corner past the vertices written so far.
 *
 * A corner is v, v/vt, v//vn or v/vt/vn. Positive indices are relative to the
 * object that declared them and must become absolute across the merged file;
 * negative indices already count back from the end of the file and stay put.
 */
function shiftCorner(
  corner: string,
  vertexOffset: number,
  normalOffset: number,
  uvOffset: number,
): string {
  const [v, vt, vn] = corner.split("/");
  const shift = (
    value: string | undefined,
    offset: number,
  ): string | undefined => {
    if (value === undefined || value === "") return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return value;
    return String(n + offset - 1);
  };
  const sv = shift(v, vertexOffset) ?? v;
  const svt = shift(vt, uvOffset);
  const svn = shift(vn, normalOffset);
  // Preserve arity: v/vt/vn and v//vn are different to importers.
  if (vt === undefined) return sv;
  if (vn === undefined) return `${sv}/${svt ?? ""}`;
  return `${sv}/${svt ?? ""}/${svn ?? ""}`;
}

export interface SceneObjSource {
  name: string;
  root: THREE.Object3D;
}

/**
 * Export every mesh in a scene as one OBJ, models and props together.
 *
 * a typical pose reference tool exports the whole composition so a prop-built scene can leave the
 * app. exportObj already bakes world transforms per object, which is exactly
 * the per-object work; this concatenates several hierarchies, shifting each
 * object's face indices past everything written before it, because OBJ indices
 * are absolute across the file rather than per object.
 */
export function exportSceneObj(
  sources: readonly SceneObjSource[],
  options: ObjExportOptions = {},
): string {
  const { name = "scene" } = options;
  const out: string[] = ["# Poseify scene export", `o ${name}`];
  let vertexOffset = 1;
  let normalOffset = 1;
  let uvOffset = 1;

  for (const source of sources) {
    const text = exportObj(source.root, { ...options, name: source.name });
    const vertices = (text.match(/^v /gm) ?? []).length;
    const normals = (text.match(/^vn /gm) ?? []).length;
    const uvs = (text.match(/^vt /gm) ?? []).length;

    // An object with no geometry is skipped rather than emitted as an empty
    // group, so a hidden or unloaded prop leaves no stub in the file.
    if (vertices === 0) continue;

    out.push(`# ${source.name}`);
    for (const line of text.split("\n")) {
      if (line.startsWith("v ") || line.startsWith("vn ") || line.startsWith("vt ")) {
        out.push(line);
      } else if (line.startsWith("f ")) {
        const faces = line
          .slice(2)
          .trim()
          .split(/\s+/)
          .map((corner) =>
            shiftCorner(corner, vertexOffset, normalOffset, uvOffset),
          );
        out.push(`f ${faces.join(" ")}`);
      }
    }
    vertexOffset += vertices;
    normalOffset += normals;
    uvOffset += uvs;
  }

  return `${out.join("\n")}\n`;
}
