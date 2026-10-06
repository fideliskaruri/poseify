// Download every reachable model FBX from the project CDN.
//
// Files are kept under public/vendor/pose-my-art/ (gitignored). See
// ATTRIBUTION.md.
//
// The source of truth for what to fetch is research/model-catalog.csv. Every
// distinct .fbx filename in that CSV is attempted and, if the CDN answers 200,
// saved.
//
// WHY THIS IS NOT SIMPLY A LOOP OF FETCHES
//
// The CDN throttles bursts *silently*. A throttled request does not come back
// 429 -- it fails to connect at all, so fetch throws and no status arrives.
// Folding that into "file absent" produces a badly wrong result: a naive burst
// over these 85 names was observed reporting zero reachable. So this script is
// deliberately slow and deliberately pedantic about outcomes:
//
//   - At most CONCURRENCY requests in flight, with MIN_GAP_MS between request
//     starts, enforced by one shared limiter.
//   - Three outcomes kept strictly apart: "ok" is HTTP 200 with bytes saved;
//     "missing" is a definite HTTP 403 or 404, which is a real answer saying
//     the object is not public; "unknown" is no usable HTTP status at all,
//     which is retried with exponential backoff and then reported as unknown.
//     Unknown is NEVER counted as missing.
//   - GET directly instead of HEAD-then-GET: a successful GET proves existence
//     and size in one request and the bytes are needed anyway. Request count
// is the scarce resource here.
//   - Consecutive throttles widen the shared gap towards COLD_GAP_MS so a
//     shared throttle window drains, and it narrows back after a success.
//
// Re-runnable: a local file already matching the CDN's content-length is left
// in place without re-downloading, so `npm run models:fetch` is cheap to
// repeat and always refreshes manifest.json and catalog-report.json.

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://posemyart3.nyc3.cdn.digitaloceanspaces.com/models/";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "research", "model-catalog.csv");
const OUT_DIR = join(ROOT, "public", "vendor", "pose-my-art");
const MANIFEST = join(OUT_DIR, "manifest.json");

const CONCURRENCY = 4;
const MIN_GAP_MS = 450;
const COLD_GAP_MS = 2000;
const MAX_ATTEMPTS = 5;
// The largest model is ~7.9 MB. On a cold or throttled connection that can
// take longer than 30s, and a timeout is recorded as "unknown", so a too-short
// budget silently drops a real file from the library.
const REQUEST_TIMEOUT_MS = 120_000;
// Extra single-file sweeps for anything the CDN throttled rather than refused.
const UNKNOWN_SWEEPS = 3;

type Outcome = "ok" | "missing" | "unknown";

interface Row {
  id: string;
  name: string;
  file: string;
  premium: string;
  hidden: string;
  exportable: string;
}

/**
 * The CSV is a dump of the app's own export, where booleans came out as `!1`
 * (true), `!0` (false) and `?` (null). Keep the raw string and expose a
 * predicate rather than pretending it is a real CSV boolean.
 */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const idx = Object.fromEntries(splitLine(lines[0]).map((h, i) => [h, i]));
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = splitLine(line);
    rows.push({
      id: c[idx.id],
      name: c[idx.name],
      file: c[idx.file],
      premium: c[idx.premium],
      hidden: c[idx.hidden],
      exportable: c[idx.exportable],
    });
  }
  return rows;
}

interface Candidate {
  file: string;
  names: string[];
  ids: string[];
  premium: boolean;
  exportable: boolean;
}

// Deduplicate by filename: several catalogue ids point at the same asset.
const byFile = new Map<string, Candidate>();
for (const r of parseCsv(readFileSync(CSV, "utf8"))) {
  if (!r.file.endsWith(".fbx")) continue;
  const existing = byFile.get(r.file);
  if (existing) {
    existing.names.push(r.name);
    existing.ids.push(r.id);
    // A file reachable from both a premium and a free row is effectively free.
    existing.premium = existing.premium && r.premium === "!1";
    existing.exportable = existing.exportable && r.exportable === "!1";
    continue;
  }
  byFile.set(r.file, {
    file: r.file,
    names: [r.name],
    ids: [r.id],
    premium: r.premium === "!1",
    exportable: r.exportable === "!1",
  });
}

const candidates = [...byFile.values()].sort((a, b) =>
  a.file.localeCompare(b.file),
);

mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Shared rate limiter: a minimum gap between request starts, plus a shared
// cold-mode flag that consecutive throttles widen.
let nextSlot = 0;
let consecutiveUnknown = 0;

function currentGap(): number {
  return consecutiveUnknown >= 3 ? COLD_GAP_MS : MIN_GAP_MS;
}

async function reserveSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + currentGap();
  if (at > now) await sleep(at - now);
}

function noteOutcome(outcome: Outcome): void {
  if (outcome === "unknown") consecutiveUnknown += 1;
  else if (outcome === "ok") consecutiveUnknown = 0;
}

const manifest: Record<string, { bytes: number; source: string }> = {};
const results: {
  file: string;
  outcome: Outcome;
  status: number;
  bytes: number;
  attempts: number;
  names: string[];
  ids: string[];
  premium: boolean;
  exportable: boolean;
  note?: string;
}[] = [];
let done = 0;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

type Attempt =
  | { outcome: "ok"; buf: Buffer }
  | { outcome: "missing"; status: number }
  | { outcome: "unknown"; status: number; note: string };

async function attempt(url: string): Promise<Attempt> {
  await reserveSlot();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A real HTTP answer. 403/404 means the object is genuinely not public.
    if (res.status === 403 || res.status === 404) {
      return { outcome: "missing", status: res.status };
    }
    if (!res.ok) {
      // An unexpected error status is not evidence of absence.
      return {
        outcome: "unknown",
        status: res.status,
        note: `HTTP ${res.status}`,
      };
    }
    return { outcome: "ok", buf: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    // No status arrived at all: connect failure or timeout. This is the
    // throttle signature, NOT proof the file is absent.
    return {
      outcome: "unknown",
      status: 0,
      note: (err as Error).message || "no response",
    };
  }
}

async function fetchCandidate(candidate: Candidate): Promise<void> {
  const { file } = candidate;
  const url = BASE + encodeURIComponent(file);
  const dest = join(OUT_DIR, file);

  const meta = {
    names: candidate.names,
    ids: candidate.ids,
    premium: candidate.premium,
    exportable: candidate.exportable,
  };

  for (let tries = 1; tries <= MAX_ATTEMPTS; tries += 1) {
    const got = await attempt(url);
    noteOutcome(got.outcome);

    if (got.outcome === "ok") {
      // The GET already happened (it is how existence and size are proven), so
      // reuse the bytes for free: only touch disk when the local copy is
      // missing or the wrong length, which is how a truncated file gets fixed.
      const unchanged =
        existsSync(dest) && statSync(dest).size === got.buf.length;
      if (!unchanged) writeFileSync(dest, got.buf);
      manifest[file] = { bytes: got.buf.length, source: url };
      done += 1;
      results.push({
        file,
        outcome: "ok",
        status: 200,
        bytes: got.buf.length,
        attempts: tries,
        ...meta,
      });
      console.log(
        `[${done}/${candidates.length}] ` +
          `${unchanged ? "cached" : "ok    "}  ${file}  ${mb(got.buf.length)}` +
          (tries > 1 ? `  (after ${tries} attempts)` : ""),
      );
      return;
    }

    if (got.outcome === "missing") {
      done += 1;
      results.push({
        file,
        outcome: "missing",
        status: got.status,
        bytes: 0,
        attempts: tries,
        ...meta,
      });
      console.log(
        `[${done}/${candidates.length}] ${got.status}     ${file}  ` +
          candidate.names.join(", "),
      );
      return;
    }

    if (tries < MAX_ATTEMPTS) {
      const wait = Math.min(1000 * 2 ** (tries - 1), 16_000);
      console.error(
        `[${done}/${candidates.length}] throttle ${file}  ` +
          `attempt ${tries}/${MAX_ATTEMPTS} in ${wait}ms (${got.note})`,
      );
      await sleep(wait);
      continue;
    }

    done += 1;
    results.push({
      file,
      outcome: "unknown",
      status: got.status,
      bytes: 0,
      attempts: tries,
      ...meta,
      note: got.note,
    });
    console.error(
      `[${done}/${candidates.length}] UNKNOWN  ${file}  no usable status after ` +
        `${MAX_ATTEMPTS} attempts -- NOT counted as missing`,
    );
  }
}

const queue = [...candidates];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const candidate = queue.shift();
      if (!candidate) return;
      await fetchCandidate(candidate);
    }
  }),
);

// A throttled file is not a missing file. The first pass can exhaust its
// retries while the CDN is rate limiting us, which on a cold `npm install`
// silently produced a 29-model catalogue instead of 33. Re-queue anything that
// came back "unknown", one at a time at the cold gap, so a burst-throttled
// fetch still converges on the real answer.
for (let sweep = 1; sweep <= UNKNOWN_SWEEPS; sweep += 1) {
  const retry = [...results]
    .filter((r) => r.outcome === "unknown")
    .map((r) => candidates.find((c) => c.file === r.file))
    .filter((c): c is (typeof candidates)[number] => !!c);
  if (retry.length === 0) break;
  console.log(
    `\nretry sweep ${sweep}: ${retry.length} throttled file(s) at a cold rate`,
  );
  consecutiveUnknown = 0;
  // Re-queueing needs the results array pruned, or fetchCandidate's early
  // return on an existing entry would skip the retry.
  for (const c of retry) {
    const at = results.findIndex((r) => r.file === c.file);
    if (at !== -1) results.splice(at, 1);
  }
  for (const c of retry) {
    await reserveSlot();
    await fetchCandidate(c);
  }
}

const sorted = [...results].sort((a, b) => a.file.localeCompare(b.file));
const okRows = sorted.filter((r) => r.outcome === "ok");
const missingRows = sorted.filter((r) => r.outcome === "missing");
const unknownRows = sorted.filter((r) => r.outcome === "unknown");

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

// Record the three-way split next to the manifest so the vendor catalogue can
// be cross-checked against what actually landed on disk, and so a throttled
// file is never mistaken for an absent one on the next run.
writeFileSync(
  join(OUT_DIR, "catalog-report.json"),
  JSON.stringify(
    {
      base: BASE,
      totals: {
        probed: candidates.length,
        downloaded: okRows.length,
        missing: missingRows.length,
        unknown: unknownRows.length,
      },
      downloaded: okRows.map((r) => r.file),
      unreachable: [...missingRows, ...unknownRows],
    },
    null,
    2,
  ),
);

const totalBytes = okRows.reduce((a, r) => a + r.bytes, 0);
console.log(
  `\nprobed ${candidates.length} distinct fbx\n` +
    `  downloaded ${okRows.length}  ${mb(totalBytes)}\n` +
    `  missing    ${missingRows.length}  (definite HTTP 403/404)\n` +
    `  unknown    ${unknownRows.length}  (no usable HTTP status -- NOT missing)`,
);

if (unknownRows.length > 0) {
  console.log("\nUNKNOWN (re-run these; they may well be present):");
  for (const r of unknownRows) {
    console.log(`  ${r.file}  — ${r.names.join(", ")}  (${r.note})`);
  }
}
