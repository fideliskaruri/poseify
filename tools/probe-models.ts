// Probe which free model files actually exist on the CDN.
//
// Pure network check: HEAD each candidate filename and record status + size so
// the download step only fetches files that are really there.

import { readFileSync } from "node:fs";

const BASE = "https://posemyart3.nyc3.cdn.digitaloceanspaces.com/models/";

interface Row {
  id: string;
  name: string;
  file: string;
  premium: string;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split("\n");
  const header = lines[0].replace(/"/g, "").split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    // Values are simple; strip quotes rather than writing a full CSV parser.
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    rows.push({
      id: cells[idx.id],
      name: cells[idx.name],
      file: cells[idx.file],
      premium: cells[idx.premium],
    });
  }
  return rows;
}

const csvPath = process.argv[2] ?? "research/model-catalog.csv";
const rows = parseCsv(readFileSync(csvPath, "utf8")).filter(
  (r) => r.premium === "!1" && r.file.endsWith(".fbx"),
);

// Deduplicate by filename: several ids point at the same asset.
const byFile = new Map<string, Row>();
for (const r of rows) if (!byFile.has(r.file)) byFile.set(r.file, r);

const CONCURRENCY = 8;
const results: { file: string; name: string; status: number; bytes: number }[] =
  [];

async function probe(row: Row): Promise<void> {
  const url = BASE + encodeURIComponent(row.file);
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = Number(res.headers.get("content-length") ?? "0");
    results.push({
      file: row.file,
      name: row.name,
      status: res.status,
      bytes: len,
    });
  } catch {
    results.push({ file: row.file, name: row.name, status: 0, bytes: 0 });
  }
}

const queue = [...byFile.values()];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      await probe(row);
    }
  }),
);

results.sort((a, b) => a.file.localeCompare(b.file));
const found = results.filter((r) => r.status === 200);

for (const r of results) {
  const mb = (r.bytes / 1024 / 1024).toFixed(2);
  console.log(
    `${r.status === 200 ? "OK  " : "MISS"} ${String(r.status).padStart(3)}  ${mb.padStart(6)} MB  ${r.file}`,
  );
}
console.log(`\n${found.length} available, ${results.length - found.length} missing`);
