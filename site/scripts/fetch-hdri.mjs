// Resolve and verify the checked-in Poly Haven HDRI.
//
//   npm run fetch:hdri --prefix site -- --check
//   npm run fetch:hdri --prefix site -- --force
//
// --check is offline and only verifies the checked-in file. --force resolves
// the 1k HDR URL through the Poly Haven API, downloads it, verifies the size
// and MD5 and only then replaces the checked-in asset.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_ID = "studio_small_09";
const API_URL = `https://api.polyhaven.com/files/${ASSET_ID}`;
const EXPECTED_SIZE = 1_615_248;
const EXPECTED_MD5 = "d5d7eb9d26d341d6aa4d11c1a54fd97c";
const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(SITE_ROOT, "src", "assets", "environments", `${ASSET_ID}_1k.hdr`);

function usage() {
  console.error(`usage: node scripts/fetch-hdri.mjs --check | --force

  --check   verify the checked-in ${ASSET_ID}_1k.hdr offline
  --force   resolve ${API_URL}, download and replace the checked-in HDRI`);
}

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

function verify(bytes, label) {
  if (bytes.byteLength !== EXPECTED_SIZE) {
    throw new Error(
      `${label}: expected ${EXPECTED_SIZE} bytes, got ${bytes.byteLength}`
    );
  }
  const digest = md5(bytes);
  if (digest !== EXPECTED_MD5) {
    throw new Error(`${label}: expected MD5 ${EXPECTED_MD5}, got ${digest}`);
  }
}

function check() {
  if (!existsSync(DEST)) throw new Error(`checked-in HDRI is missing: ${DEST}`);
  const bytes = readFileSync(DEST);
  verify(bytes, DEST);
  console.log(`[fetch-hdri] OK ${DEST} (${bytes.byteLength} bytes, MD5 ${EXPECTED_MD5})`);
}

async function refresh() {
  const response = await fetch(API_URL, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Poly Haven API ${API_URL} returned HTTP ${response.status}`);
  }
  const files = await response.json();
  const url = files?.hdri?.["1k"]?.hdr?.url;
  const apiSize = files?.hdri?.["1k"]?.hdr?.size;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error(`Poly Haven API response has no 1k HDR URL for ${ASSET_ID}`);
  }
  if (typeof apiSize === "number" && apiSize !== EXPECTED_SIZE) {
    throw new Error(`Poly Haven API reports ${apiSize} bytes; expected ${EXPECTED_SIZE}`);
  }

  console.log(`[fetch-hdri] downloading ${url}`);
  const download = await fetch(url);
  if (!download.ok) {
    throw new Error(`HDRI download ${url} returned HTTP ${download.status}`);
  }
  const bytes = new Uint8Array(await download.arrayBuffer());
  verify(bytes, url);

  mkdirSync(dirname(DEST), { recursive: true });
  const temp = `${DEST}.tmp`;
  try {
    writeFileSync(temp, bytes);
    renameSync(temp, DEST);
  } finally {
    rmSync(temp, { force: true });
  }
  console.log(`[fetch-hdri] wrote ${DEST} (${bytes.byteLength} bytes, MD5 ${EXPECTED_MD5})`);
}

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => arg !== "--check" && arg !== "--force");
if (unknown.length > 0 || args.size > 1) {
  usage();
  process.exitCode = 2;
} else if (args.has("--check")) {
  check();
} else if (args.has("--force")) {
  refresh().catch((error) => {
    console.error(`[fetch-hdri] ${error.stack || error}`);
    process.exitCode = 1;
  });
} else {
  usage();
  process.exitCode = 2;
}
