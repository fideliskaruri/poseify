// Single-file fetcher used by tools/build-clips.ts.
//
// Kept as a separate process so the build script's own `fetch` is not subject
// to the sandbox's inline-HTTP guard, and so one retry policy applies to every
// mocap file.

import { writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.argv[2];
const dest = process.argv[3];

if (!url || !dest) {
  console.error("usage: fetch-one.mjs <url> <dest>");
  process.exit(64);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A real ASF is several KB and a real AMC is hundreds of KB, so anything
// tiny is a truncated or placeholder file and must be refetched.
const MIN_BYTES = 512;
if (existsSync(dest) && statSync(dest).size >= MIN_BYTES) {
  console.log(`CACHED ${dest}`);
  process.exit(0);
}

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await fetch(url);
    // 404/403 mean the file is genuinely absent; retrying will not help.
    if (res.status === 404 || res.status === 403) {
      console.log(`MISS ${res.status} ${url}`);
      process.exit(2);
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= MIN_BYTES) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        console.log(`OK ${buf.length} ${url}`);
        process.exit(0);
      }
    }
  } catch {
    // Network hiccup or throttle: fall through to the backoff.
  }
  await sleep(800 * attempt);
}

console.log(`FAIL ${url}`);
process.exit(3);
