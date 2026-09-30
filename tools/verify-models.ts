// Verify the downloaded FBX models parse and match the Poseify rig contract.
//
// Runs in Node against the raw files so a bad download or an unexpected bone
// naming scheme is caught before the browser ever sees it.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Box3, Group } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { CORE_BONES, validateSkeleton } from "../src/rig/RigContract";
import { retargetSkeleton } from "../src/rig/Retargeter";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "vendor", "pose-my-art");

const manifest = JSON.parse(
  readFileSync(join(OUT_DIR, "manifest.json"), "utf8"),
) as Record<string, { bytes: number; source: string }>;

const loader = new FBXLoader();
let ok = 0;
const files = Object.keys(manifest).sort();

for (const file of files) {
  try {
    // These are binary ("Kaydara FBX Binary") files. FBXLoader.parse sniffs the
    // magic itself, so handing over the raw bytes is all that is needed.
    //
    // The loader decodes via `new Uint8Array(buffer, from, to)`, which expects
    // a real ArrayBuffer. A Node Buffer is a Uint8Array view, so passing one
    // directly makes the offset view wrong and the magic check fail with
    // "Unknown format". Copy into a standalone ArrayBuffer first.
    const buf = readFileSync(join(OUT_DIR, file));
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const root = loader.parse(ab, file) as Group;

    const names: string[] = [];
    let skinned = 0;
    root.traverse((o) => {
      const a = o as unknown as Record<string, boolean | undefined>;
      if (a.isBone) names.push(o.name);
      if (a.isSkinnedMesh) skinned += 1;
    });

    const v = validateSkeleton(names);
    const re = retargetSkeleton(root);
    const box = new Box3().setFromObject(root);
    const height = box.max.clone().sub(box.min).y;
    const exact = names.filter((n) =>
      (CORE_BONES as readonly string[]).includes(n),
    ).length;
    const strategies = new Map<string, number>();
    for (const m of re.matches.values()) {
      strategies.set(m.strategy, (strategies.get(m.strategy) ?? 0) + 1);
    }

    // Raw names are namespaced (mixamorigRightUpLeg), so a literal name check
    // always fails. What matters is whether the retargeter resolves every core
    // bone onto a real bone in this file.
    const contractOk = re.ok;
    if (contractOk) ok += 1;
    const strat = [...strategies.entries()]
      .map(([k, n]) => `${k}=${n}`)
      .join(" ");

    console.log(
      `${contractOk ? "OK  " : "FAIL"} ${file.padEnd(32)} bones=${String(names.length).padStart(3)} ` +
        `core=${String(exact).padStart(2)} skin=${skinned} h=${height.toFixed(2).padStart(5)} ${strat}` +
        (contractOk ? "" : `  UNRESOLVED ${re.missing.slice(0, 4).join(",")}`),
    );
    void v;
  } catch (err) {
    console.log(`FAIL ${file.padEnd(32)} ${(err as Error).message}`);
  }
}

console.log(`\n${ok}/${files.length} validate clean`);
