// Resolve and verify the checked-in Poly Haven HDRIs.
//
//   npm run fetch:hdri --prefix site -- --check
//   npm run fetch:hdri --prefix site -- --force
//   npm run fetch:hdri --prefix site -- --check --asset=studio_small_09
//
// --check is offline and only verifies the checked-in files. --force resolves
// each 1k HDR URL through the Poly Haven API, downloads it, verifies the size
// and MD5 and only then replaces the checked-in asset.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST_DIR = join(SITE_ROOT, "src", "assets", "environments");

const ASSETS = {
  studio_small_09: {
    size: 1_615_248,
    md5: "d5d7eb9d26d341d6aa4d11c1a54fd97c",
    file: "studio_small_09_1k.hdr"
  },
  kloofendal_48d_partly_cloudy_puresky: {
    size: 1_435_119,
    md5: "c69498687e876bf68d2a8b8a62234eb9",
    file: "kloofendal_48d_partly_cloudy_puresky_1k.hdr"
  },
  qwantani_dusk_2_puresky: {
    size: 1_166_018,
    md5: "d400530e33f683654e70b4a087b6fe8d",
    file: "qwantani_dusk_2_puresky_1k.hdr"
  }
};

function usage() {
  console.error(`usage: node scripts/fetch-hdri.mjs --check | --force [--asset=<id>]

  --check   verify the checked-in HDRI(s) offline
  --force   resolve the Poly Haven API, download and replace the HDRI(s)

  assets: ${Object.keys(ASSETS).join(", ")}`);
}

function destination(asset) {
  return join(DEST_DIR, asset.file);
}

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

function verify(id, bytes, label) {
  const expected = ASSETS[id];
  if (bytes.byteLength !== expected.size) {
    throw new Error(`${label}: expected ${expected.size} bytes, got ${bytes.byteLength}`);
  }
  const digest = md5(bytes);
  if (digest !== expected.md5) {
    throw new Error(`${label}: expected MD5 ${expected.md5}, got ${digest}`);
  }
}

function selectedAssets() {
  const id = [...process.argv.slice(2)]
    .find((arg) => arg.startsWith("--asset="))
    ?.slice("--asset=".length);
  if (!id) return Object.keys(ASSETS);
  if (!ASSETS[id]) throw new Error(`unknown HDRI asset: ${id}`);
  return [id];
}

function check() {
  for (const id of selectedAssets()) {
    const path = destination(ASSETS[id]);
    if (!existsSync(path)) throw new Error(`checked-in HDRI is missing: ${path}`);
    const bytes = readFileSync(path);
    verify(id, bytes, path);
    console.log(`[fetch-hdri] OK ${path} (${bytes.byteLength} bytes, MD5 ${ASSETS[id].md5})`);
  }
}

async function refresh() {
  for (const id of selectedAssets()) {
    const expected = ASSETS[id];
    const apiUrl = `https://api.polyhaven.com/files/${id}`;
    const response = await fetch(apiUrl, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Poly Haven API ${apiUrl} returned HTTP ${response.status}`);
    }
    const files = await response.json();
    const url = files?.hdri?.["1k"]?.hdr?.url;
    const apiSize = files?.hdri?.["1k"]?.hdr?.size;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error(`Poly Haven API response has no 1k HDR URL for ${id}`);
    }
    if (typeof apiSize === "number" && apiSize !== expected.size) {
      throw new Error(`Poly Haven API reports ${apiSize} bytes; expected ${expected.size}`);
    }

    console.log(`[fetch-hdri] downloading ${url}`);
    const download = await fetch(url);
    if (!download.ok) {
      throw new Error(`HDRI download ${url} returned HTTP ${download.status}`);
    }
    const bytes = new Uint8Array(await download.arrayBuffer());
    verify(id, bytes, url);

    mkdirSync(DEST_DIR, { recursive: true });
    const dest = destination(expected);
    const temp = `${dest}.tmp`;
    try {
      writeFileSync(temp, bytes);
      renameSync(temp, dest);
    } finally {
      rmSync(temp, { force: true });
    }
    console.log(`[fetch-hdri] wrote ${dest} (${bytes.byteLength} bytes, MD5 ${expected.md5})`);
  }
}

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter(
  (arg) => arg !== "--check" && arg !== "--force" && !arg.startsWith("--asset=")
);
if (unknown.length > 0 || (args.has("--check") && args.has("--force")) || (!args.has("--check") && !args.has("--force"))) {
  usage();
  process.exitCode = 2;
} else if (args.has("--check")) {
  try {
    check();
  } catch (error) {
    console.error(`[fetch-hdri] ${error.message}`);
    process.exitCode = 2;
  }
} else {
  try {
    selectedAssets();
  } catch (error) {
    console.error(`[fetch-hdri] ${error.message}`);
    process.exit(2);
  }
  refresh().catch((error) => {
    console.error(`[fetch-hdri] ${error.stack || error}`);
    process.exitCode = 1;
  });
}
