// ASF / AMC parsing, in the format CMU actually serves.
//
// CMU's .asf files are ASF version 1.10, not the classic :OFFSETS layout.
// A 1.10 file has:
//   :units      length/angle scale
//   :bonedata   per-bone direction, length and rotation axis
//   :hierarchy  parent -> space-separated children, starting with the root
// and the .amc holds one whitespace-separated line of Euler degrees per frame,
// in :bonedata order.
//
// Everything here runs at build time; the browser only sees converted
// quaternion clips.

export interface AsfBone {
  name: string;
  /** Parent bone name, or null for a root bone. */
  parent: string | null;
  /** Unit direction from this bone toward its child, in bone space. */
  direction: [number, number, number];
  /** Bone length in ASF length units. */
  length: number;
  /** Local rotation axis, degrees. */
  axisAngle: [number, number, number];
  /** Axis order label, always XYZ in practice. */
  axisOrder: string;
}

export interface AsfSkeleton {
  bones: AsfBone[];
  /** Bone names in :bonedata order, which is the AMC channel order. */
  boneOrder: string[];
  /** Root bone name. */
  root: string;
  frameRate: number;
  /** Metres per ASF length unit. CMU declares 0.45. */
  lengthUnitsToMeters: number;
  angleIsDegrees: boolean;
}

export interface AmcFrame {
  /** Euler angles in degrees, in :bonedata order. */
  rotations: number[];
  /** Root translation in metres, when the root line carries one. */
  translation?: [number, number, number];
}

export interface AmcClip {
  frames: AmcFrame[];
  frameRate: number;
}

export class MocapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MocapParseError";
  }
}

function num(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse an ASF 1.10 skeleton, the CMU dialect.
 *
 * Rotation data lives in :bonedata rather than an :OFFSETS block, and the
 * parent relationships come from :hierarchy.
 */
export function parseAsf(text: string): AsfSkeleton {
  const lines = text.split(/\r?\n/);

  let lengthUnitsToMeters = 0.45;
  let angleIsDegrees = true;
  let frameRate = 120;

  for (let i = 0; i < lines.length; i++) {
    if (!/^:units/i.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && !lines[j].trim().startsWith(":"); j++) {
      const lenMatch = /^\s*length\s+(\S+)/i.exec(lines[j]);
      if (lenMatch) lengthUnitsToMeters = num(lenMatch[1], 0.45);
      if (/^\s*angle\s+deg/i.test(lines[j])) angleIsDegrees = true;
      if (/^\s*angle\s+rad/i.test(lines[j])) angleIsDegrees = false;
    }
    break;
  }

  const rateMatch = /^:control_rate\s+(\S+)/im.exec(text);
  if (rateMatch) frameRate = num(rateMatch[1], 120);

  const boneMap = new Map<string, AsfBone>();
  const boneOrder: string[] = [];
  let inBoneData = false;
  let current: {
    name: string;
    direction: [number, number, number];
    length: number;
    axisAngle: [number, number, number];
    axisOrder: string;
  } | null = null;

  const flush = (): void => {
    if (!current || !current.name) return;
    boneMap.set(current.name, {
      name: current.name,
      parent: null,
      direction: current.direction,
      length: current.length,
      axisAngle: current.axisAngle,
      axisOrder: current.axisOrder,
    });
    boneOrder.push(current.name);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    if (line.startsWith(":")) {
      flush();
      inBoneData = /^:bonedata/i.test(line);
      continue;
    }
    if (!inBoneData) continue;

    if (/^begin\b/i.test(line)) {
      current = {
        name: "",
        direction: [0, 0, 0],
        length: 0,
        axisAngle: [0, 0, 0],
        axisOrder: "XYZ",
      };
      continue;
    }
    if (/^end\b/i.test(line)) {
      flush();
      continue;
    }
    if (!current) continue;

    const nameMatch = /^name\s+(\S+)/i.exec(line);
    if (nameMatch) current.name = nameMatch[1];
    const dirMatch = /^direction\s+(.+)$/i.exec(line);
    if (dirMatch) {
      const parts = dirMatch[1].trim().split(/\s+/);
      current.direction = [num(parts[0]), num(parts[1]), num(parts[2])];
    }
    const lenMatch = /^length\s+(\S+)/i.exec(line);
    if (lenMatch) current.length = num(lenMatch[1]);
    const axisMatch = /^axis\s+(.+)$/i.exec(line);
    if (axisMatch) {
      const parts = axisMatch[1].trim().split(/\s+/);
      current.axisAngle = [num(parts[0]), num(parts[1]), num(parts[2])];
      current.axisOrder = (parts[3] ?? "XYZ").toUpperCase();
    }
  }
  flush();

  if (boneOrder.length === 0) {
    throw new MocapParseError(
      "ASF contained no :bonedata entries; nothing to convert.",
    );
  }

  let inHierarchy = false;
  // The hierarchy's first line is the pseudo-parent "root"; the bones listed
  // after it are the actual roots, so the first one is our skeleton root.
  let root = boneOrder[0];
  let firstHierarchyLine = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith(":")) {
      inHierarchy = /^:hierarchy/i.test(line);
      if (inHierarchy) firstHierarchyLine = true;
      continue;
    }
    if (!inHierarchy) continue;
    if (/^begin$/i.test(line) || /^end$/i.test(line)) continue;

    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;

    const [parentName, ...children] = parts;
    if (firstHierarchyLine) {
      root = children[0] ?? parentName;
      firstHierarchyLine = false;
    }
    // The hierarchy's first line is a pseudo-parent literally named "root";
    // it is not a real bone and carries no parent relationship.
    if (parentName.toLowerCase() === "root") continue;
    for (const child of children) {
      const bone = boneMap.get(child);
      if (bone) bone.parent = parentName;
    }
  }

  return {
    bones: boneOrder.map((name) => boneMap.get(name)!).filter(Boolean),
    boneOrder,
    root,
    frameRate,
    lengthUnitsToMeters,
    angleIsDegrees,
  };
}

/**
 * Parse a `:FULLY-SPECIFIED` AMC motion against a parsed ASF skeleton.
 *
 * In this variant each frame is introduced by a bare integer frame number and
 * every bone is written on its own named line, so the data is self-describing
 * and does not rely on channel ordering:
 *
 *   1
 *   root TX TY TZ RX RY RZ
 *   lowerback RX RY RZ
 *   ...
 *
 * The root carries a translation before its rotation; every other bone carries
 * three Euler angles. Bones absent from a frame are left at zero rotation.
 */
export function parseAmc(text: string, skeleton: AsfSkeleton): AmcClip {
  const frames: AmcFrame[] = [];
  const indexOf = new Map(skeleton.boneOrder.map((n, i) => [n, i]));
  // Three Euler channels per bone. `idx` below is a bone index, so every
  // channel write is offset by three bones' worth of channels.
  const stride = skeleton.boneOrder.length * 3;

  let rotations: number[] | null = null;
  let translation: [number, number, number] | undefined;

  const commit = (): void => {
    if (rotations) {
      frames.push(translation ? { rotations, translation } : { rotations });
    }
    rotations = null;
    translation = undefined;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;

    // Directives and the frame-number marker.
    if (line.startsWith("#")) continue;
    if (line.startsWith(":")) continue;

    const parts = line.split(/\s+/);

    // A bare integer starts a new frame.
    if (parts.length === 1 && Number.isInteger(Number(parts[0]))) {
      commit();
      rotations = new Array(stride).fill(0);
      continue;
    }

    if (!rotations) continue;

    let boneName = parts[0];
    // The motion's root line is the pseudo-bone "root", which carries the
    // global translation. Map it onto the skeleton's actual root bone.
    const isPseudoRoot = boneName.toLowerCase() === "root";
    if (isPseudoRoot) boneName = skeleton.root;

    const idx = indexOf.get(boneName);
    if (idx === undefined) continue;

    const values = parts.slice(1).map(Number);
    if (values.some((n) => !Number.isFinite(n))) continue;

    if (values.length >= 6) {
      // Root: TX TY TZ RX RY RZ, translation in ASF length units.
      const s = skeleton.lengthUnitsToMeters;
      translation = [values[0] * s, values[1] * s, values[2] * s];
      const c = idx * 3;
      rotations[c] = values[3];
      rotations[c + 1] = values[4];
      rotations[c + 2] = values[5];
    } else if (values.length >= 3) {
      const c = idx * 3;
      rotations[c] = values[0];
      rotations[c + 1] = values[1];
      rotations[c + 2] = values[2];
    }
  }

  commit();

  return { frames, frameRate: skeleton.frameRate };
}

/** Strip namespaces and punctuation so names can match the rig contract. */
export function normaliseBoneName(name: string): string {
  return name
    .replace(/^.*:/, "")
    .replace(/^mixamorig\d*/i, "")
    .replace(/[.\-\s]/g, "")
    .trim();
}

/**
 * Map a CMU bone name onto the Poseify rig contract.
 *
 * CMU uses names like `lhipjoint`, `lfemur`, `lowerback`; the contract uses
 * `Hips`, `LeftUpLeg`, `Spine`. Returns null when there is no confident match,
 * so unmapped bones are left undriven rather than driven wrong.
 */
export function mapCmuBoneToContract(name: string): string | null {
  const n = normaliseBoneName(name).toLowerCase();
  const table: Record<string, string> = {
    lhipjoint: "LeftUpLeg",
    rhipjoint: "RightUpLeg",
    lfemur: "LeftLeg",
    rfemur: "RightLeg",
    ltibia: "LeftFoot",
    rtibia: "RightFoot",
    lfoot: "LeftToeBase",
    rfoot: "RightToeBase",
    ltoes: "LeftToeBase",
    rtoes: "RightToeBase",
    lowerback: "Spine",
    upperback: "Spine1",
    thorax: "Spine2",
    lowerneck: "Neck",
    upperneck: "Head",
    head: "Head",
    lclavicle: "LeftShoulder",
    rclavicle: "RightShoulder",
    lhumerus: "LeftArm",
    rhumerus: "RightArm",
    lradius: "LeftForeArm",
    rradius: "RightForeArm",
    lhand: "LeftHand",
    rhand: "RightHand",
  };
  return table[n] ?? null;
}
