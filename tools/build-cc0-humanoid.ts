import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Node has no FileReader; GLTFExporter binary path needs one.
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((ab) => {
        this.result = ab;
        this.onloadend?.();
      })
      .catch((err) => this.onerror?.(err));
  }
}
(globalThis as unknown as { FileReader: typeof NodeFileReader }).FileReader =
  NodeFileReader;

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(rootDir, "public", "models", "cc0-humanoid.glb");

function bone(name: string, y: number): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.y = y;
  return b;
}

const hips = bone("Hips", 0);
const spine = bone("Spine", 0.12);
const spine1 = bone("Spine1", 0.12);
const spine2 = bone("Spine2", 0.12);
const neck = bone("Neck", 0.12);
const head = bone("Head", 0.12);
const leftShoulder = bone("LeftShoulder", 0.08);
const leftArm = bone("LeftArm", 0.14);
const leftForeArm = bone("LeftForeArm", 0.28);
const leftHand = bone("LeftHand", 0.26);
const rightShoulder = bone("RightShoulder", 0.08);
const rightArm = bone("RightArm", 0.14);
const rightForeArm = bone("RightForeArm", 0.28);
const rightHand = bone("RightHand", 0.26);
const leftUpLeg = bone("LeftUpLeg", -0.05);
const leftLeg = bone("LeftLeg", -0.42);
const leftFoot = bone("LeftFoot", -0.42);
const rightUpLeg = bone("RightUpLeg", -0.05);
const rightLeg = bone("RightLeg", -0.42);
const rightFoot = bone("RightFoot", -0.42);

hips.add(spine, leftUpLeg, rightUpLeg);
spine.add(spine1);
spine1.add(spine2);
spine2.add(neck, leftShoulder, rightShoulder);
neck.add(head);
leftShoulder.position.x = 0.08;
leftShoulder.add(leftArm);
leftArm.add(leftForeArm);
leftForeArm.add(leftHand);
rightShoulder.position.x = -0.08;
rightShoulder.add(rightArm);
rightArm.add(rightForeArm);
rightForeArm.add(rightHand);
leftUpLeg.position.x = 0.1;
leftUpLeg.add(leftLeg);
leftLeg.add(leftFoot);
rightUpLeg.position.x = -0.1;
rightUpLeg.add(rightLeg);
rightLeg.add(rightFoot);

const bones = [
  hips, spine, spine1, spine2, neck, head,
  leftShoulder, leftArm, leftForeArm, leftHand,
  rightShoulder, rightArm, rightForeArm, rightHand,
  leftUpLeg, leftLeg, leftFoot,
  rightUpLeg, rightLeg, rightFoot,
];
const skeleton = new THREE.Skeleton(bones);

const geo = new THREE.CapsuleGeometry(0.22, 1.1, 4, 8);
geo.translate(0, 0.95, 0);
const pos = geo.attributes.position;
const skinIndex = new THREE.BufferAttribute(new Uint16Array(pos.count * 4), 4);
const skinWeight = new THREE.BufferAttribute(new Float32Array(pos.count * 4), 4);
for (let i = 0; i < pos.count; i++) {
  const y = pos.getY(i);
  let bi = 0;
  if (y > 1.5) bi = bones.indexOf(head);
  else if (y > 1.25) bi = bones.indexOf(neck);
  else if (y > 0.9) bi = bones.indexOf(spine2);
  else if (y > 0.6) bi = bones.indexOf(spine1);
  else if (y > 0.35) bi = bones.indexOf(spine);
  else if (y < 0.35) {
    bi = pos.getX(i) >= 0 ? bones.indexOf(leftUpLeg) : bones.indexOf(rightUpLeg);
  }
  skinIndex.setXYZW(i, bi, 0, 0, 0);
  skinWeight.setXYZW(i, 1, 0, 0, 0);
}
geo.setAttribute("skinIndex", skinIndex);
geo.setAttribute("skinWeight", skinWeight);

const mat = new THREE.MeshStandardMaterial({
  color: 0x8a9bb0,
  metalness: 0.05,
  roughness: 0.7,
});
const mesh = new THREE.SkinnedMesh(geo, mat);
mesh.name = "Body";
mesh.add(hips);
mesh.bind(skeleton);

const root = new THREE.Group();
root.name = "CC0Humanoid";
root.add(mesh);

const exporter = new GLTFExporter();
const glb = (await exporter.parseAsync(root, {
  binary: true,
  onlyVisible: true,
})) as ArrayBuffer;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(glb));
console.log("wrote", outPath, glb.byteLength);
