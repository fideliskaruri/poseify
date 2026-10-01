// One-shot asset setup, run from `npm install` via postinstall.
//
// The model FBX files and the mocap clip library are not committed (see
// ATTRIBUTION.md), so a fresh clone needs to fetch them before the app has
// anything to show. Each step is independent: if one fails the others still
// run, and a failure never fails the install itself, because a developer with
// no network should still be able to install, build and run the tests.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR = join(ROOT, "public", "vendor", "pose-my-art");
const CLIP_DIR = join(ROOT, "public", "vendor", "mocap", "clips");

function run(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["vite-node", script], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let output = "";
    child.stdout?.on("data", (d: string) => {
      output += String(d);
    });
    child.stderr?.on("data", (d: string) => {
      output += String(d);
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0) {
        console.log(output.trim().split("\n").slice(-6).join("\n"));
      }
      resolve(code === 0);
    });
  });
}

async function main(): Promise<void> {
  const haveModels = existsSync(MODEL_DIR);
  const haveClips = existsSync(CLIP_DIR);

  if (haveModels && haveClips) {
    console.log("poseify: assets already present, skipping download.");
    return;
  }

  if (!haveModels) {
    console.log("poseify: fetching model FBX files (first run only, ~31 MB)...");
    if (!(await run("tools/fetch-models.ts"))) {
      console.warn(
        "poseify: could not fetch models. The app will start but the model " +
          "library will be empty. Re-run `npm run models:fetch` when online.",
      );
    }
  }

  if (!haveClips) {
    console.log("poseify: fetching and converting mocap clips (about 20 min)...");
    if (!(await run("tools/build-clips.ts"))) {
      console.warn(
        "poseify: could not fetch mocap clips. The animation panel will be " +
          "empty. Re-run `npm run clips:build` when online.",
      );
    }
  }
}

await main();
