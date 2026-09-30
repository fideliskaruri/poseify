// Download the free PoseMy.Art model FBXs from their public CDN.
//
// These files are PoseMy.Art's own assets, not CC0. They are kept under
// public/vendor/pose-my-art/ so they are obvious, separable, and easy to
// replace with clean assets later. Do not relicense them as MIT.

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://posemyart3.nyc3.cdn.digitaloceanspaces.com/models/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "vendor", "pose-my-art");
const MANIFEST = join(OUT_DIR, "manifest.json");

const FILES = [
  "male_mannequin_OP_IK.fbx",
  "anime_female_OP_IK.fbx",
  "anime_basic_male_OP_IK.fbx",
  "anime_basic_female_OP_IK.fbx",
  "chibi_male_OP_IK.fbx",
  "male_stocky_OP_IK.fbx",
  "female_stocky_OP_IK.fbx",
  "male_teen_fit_OP_IK.fbx",
  "female_teen_fit_OP_IK.fbx",
  "zombie_alien_OP_IK.fbx",
  "new_X_bot_OP_IK.fbx",
  "new_Y_bot_OP_IK.fbx",
  "x_bot_fixed_OP_IK.fbx",
  "y_bot_fixed_OP_IK.fbx",
  "xbot_opt.fbx",
  "ybot_opt.fbx",
];

mkdirSync(OUT_DIR, { recursive: true });

const CONCURRENCY = 4;
const manifest: Record<string, { bytes: number; source: string }> = {};
let done = 0;
let failed = 0;

async function download(file: string): Promise<void> {
  const dest = join(OUT_DIR, file);
  if (existsSync(dest) && statSync(dest).size > 0) {
    manifest[file] = {
      bytes: statSync(dest).size,
      source: BASE + file,
    };
    done += 1;
 console.log(`[${done}/${FILES.length}] cached  ${file}`);
    return;
  }

  try {
    const res = await fetch(BASE + encodeURIComponent(file));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    manifest[file] = { bytes: buf.length, source: BASE + file };
    done += 1;
    console.log(`[${done}/${FILES.length}] ok     ${file}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  } catch (err) {
    failed += 1;
    console.error(`[${done}/${FILES.length}] FAILED ${file}: ${(err as Error).message}`);
  }
}

const queue = [...FILES];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      await download(file);
    }
  }),
);

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
const totalBytes = Object.values(manifest).reduce((a, m) => a + m.bytes, 0);
console.log(
  `\n${done} files, ${failed} failed, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`,
);
