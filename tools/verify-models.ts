// Verify the downloaded FBX models parse, and report which of them satisfy the
// Poseify rig contract.
//
// Runs in Node against the raw files so a bad download or an unexpected bone
// naming scheme is caught before the browser ever sees it.
//
// IMPORTANT: not every catalogue model is a humanoid. The catalogue
// deliberately includes creatures (mermaids, werewolf) and an animal (horse),
// and those are not expected to resolve the 20-bone contract -- a horse has no
// LeftShoulder. Treating that as a failure would make this tool useless, so
// known non-humanoid files are reported as NOT-HUMAN and do not fail the run.
// What this script actually guards against is a corrupted download, an
// unexpected parse failure, and a humanoid that silently stops posing.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Box3, Group } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { CORE_BONES } from "../src/rig/RigContract";
import { retargetSkeleton } from "../src/rig/Retargeter";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "vendor", "pose-my-art");

const manifest = JSON.parse(
  readFileSync(join(OUT_DIR, "manifest.json"), "utf8"),
) as Record<string, { bytes: number; source: string }>;

// Models that are not humanoids on purpose. Keep this in sync with the
// `exportable: false` entries in src/models/VendorCatalog.ts. It only
// relabels the report; it never hides a parse failure.
const NON_HUMANOID = new Set([
  "female_mermaid_IK.fbx",
  "male_mermaid_IK.fbx",
  "werewolf_IK.fbx",
  "horse.fbx",
]);

const loader = new FBXLoader();
const files = Object.keys(manifest).sort();

let humanoid = 0;
let nonHumanoid = 0;
let broken = 0;
const failures: string[] = [];

for (const file of files) {
  let root: Group;
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
    root = loader.parse(ab, file) as Group;
  } catch (err) {
    broken += 1;
    failures.push(`${file}: ${(err as Error).message}`);
    console.log(`BROKEN ${file.padEnd(32)} ${(err as Error).message}`);
    continue;
  }

  const names: string[] = [];
  let skinned = 0;
  root.traverse((o) => {
    const a = o as unknown as Record<string, boolean | undefined>;
    if (a.isBone) names.push(o.name);
    if (a.isSkinnedMesh) skinned += 1;
  });

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
  const strat = [...strategies.entries()]
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");

  const tail =
    `bones=${String(names.length).padStart(3)} ` +
    `core=${String(exact).padStart(2)} skin=${skinned} ` +
    `h=${height.toFixed(2).padStart(5)} ${strat}`;

  // Raw names are namespaced (mixamorigRightUpLeg), so a literal name check
  // always fails. What matters is whether the retargeter resolves every core
  // bone onto a real bone in this file.
  if (re.ok) {
    humanoid += 1;
    console.log(`OK       ${file.padEnd(32)} ${tail}`);
    continue;
  }

  if (NON_HUMANOID.has(file)) {
    nonHumanoid += 1;
    console.log(
      `NOT-HUMAN ${file.padEnd(31)} ${tail}\n` +
        ` expected: unresolved ${re.missing.slice(0, 6).join(",")}`,
    );
    continue;
  }

  // A humanoid by classification that cannot be posed is a real regression.
  broken += 1;
  failures.push(`${file}: unresolved ${re.missing.join(",")}`);
  console.log(
    `FAIL     ${file.padEnd(32)} ${tail}\n` +
      `   UNRESOLVED ${re.missing.slice(0, 8).join(",")}`,
  );
}

console.log(
  `\n${humanoid} humanoid contract-clean, ` +
    `${nonHumanoid} non-humanoid by design, ${broken} failed (of ${files.length})`,
);

if (failures.length > 0) {
  console.error("\nfailures:");
  for (const f of failures) console.error(`  ${f}`);
  process.exitCode = 1;
}
