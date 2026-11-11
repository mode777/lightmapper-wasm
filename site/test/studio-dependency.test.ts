// Guards the showcase's studio dependency shape:
// - `lightmap-studio` always resolves from the npm registry at ^0.1.0,
// - exactly one `lightmapper-wasm` copy exists and it is the local `file:..` link.
//
// Run with `npm test --prefix site` (vitest picks up test/**/*.test.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SITE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

interface LockEntry {
  version?: string;
  resolved?: string;
  link?: boolean;
}

interface Lockfile {
  packages: Record<string, LockEntry>;
}

interface Manifest {
  dependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
}

const STUDIO_SPEC = "^0.1.0";
const STUDIO_NAME = "lightmap-studio";
const WRAPPER_NAME = "lightmapper-wasm";
const WRAPPER_ENTRY = `node_modules/${WRAPPER_NAME}`;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadManifest(): Manifest {
  return readJson<Manifest>(join(SITE_ROOT, "package.json"));
}

function loadLock(): Lockfile {
  return readJson<Lockfile>(join(SITE_ROOT, "package-lock.json"));
}

/** Parse the supported `^0.1.0` range into a comparable lower/upper bound. */
function satisfiesStudioRange(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major !== 0 || minor !== 1) return false;
  return patch >= 0;
}

function studioEntry(lock: Lockfile): LockEntry | undefined {
  return lock.packages[`node_modules/${STUDIO_NAME}`];
}

function wrapperEntries(lock: Lockfile): Array<[string, LockEntry]> {
  return Object.entries(lock.packages).filter(
    ([path]) => path === WRAPPER_ENTRY || path.endsWith(`/node_modules/${WRAPPER_NAME}`)
  );
}

/** Every problem with the studio dependency shape, phrased for a failing test. */
export function studioDependencyProblems(manifest: Manifest, lock: Lockfile): string[] {
  const problems: string[] = [];
  const spec = manifest.dependencies?.[STUDIO_NAME];

  if (spec !== STUDIO_SPEC) {
    problems.push(
      `${STUDIO_NAME} must be "${STUDIO_SPEC}" from the npm registry, found "${spec ?? "<missing>"}"`
    );
  }

  const studio = studioEntry(lock);
  if (!studio) {
    problems.push(`site lockfile has no node_modules/${STUDIO_NAME} entry`);
  } else if (studio.link || !studio.resolved?.startsWith(`https://registry.npmjs.org/${STUDIO_NAME}/`)) {
    problems.push(
      `${STUDIO_NAME} resolves from a local path instead of the npm registry: ${studio.resolved ?? "<no resolved>"}`
    );
  } else if (!studio.version || !satisfiesStudioRange(studio.version)) {
    problems.push(
      `${STUDIO_NAME}@${studio.version ?? "<unknown>"} does not satisfy ${STUDIO_SPEC}`
    );
  }

  const wrappers = wrapperEntries(lock);
  if (wrappers.length !== 1) {
    problems.push(
      `expected exactly one ${WRAPPER_NAME} entry, found ${wrappers.length}: ${wrappers
        .map(([path]) => path)
        .join(", ")}`
    );
  }

  const local = lock.packages[WRAPPER_ENTRY];
  if (local && (local.link !== true || local.resolved !== "..")) {
    problems.push(
      `${WRAPPER_ENTRY} must link to the local file:.. artifact, found ${JSON.stringify(local)}`
    );
  }

  for (const [path, entry] of wrappers) {
    if (path !== WRAPPER_ENTRY) {
      problems.push(
        `nested ${WRAPPER_NAME} copy at ${path} (${entry.resolved ?? "no resolved"}) beside ${WRAPPER_ENTRY}`
      );
    }
  }

  return problems;
}

describe("site studio dependency", () => {
  it("consumes lightmap-studio from the npm registry at ^0.1.0", () => {
    expect(studioDependencyProblems(loadManifest(), loadLock())).toEqual([]);
  });

  it("declares the wrapper override for the published studio", () => {
    const overrides = loadManifest().overrides as
      | Record<string, Record<string, string>>
      | undefined;
    expect(overrides?.[STUDIO_NAME]?.[WRAPPER_NAME]).toBe(`$${WRAPPER_NAME}`);
  });

  it("rejects a reintroduced local studio link", () => {
    const problems = studioDependencyProblems(
      { dependencies: { [STUDIO_NAME]: "file:../studio" } },
      {
        packages: {
          [`node_modules/${STUDIO_NAME}`]: {
            version: "0.1.0",
            resolved: "../studio",
            link: true
          },
          [WRAPPER_ENTRY]: { resolved: "..", link: true }
        }
      }
    );
    expect(problems.join("\n")).toContain("local path");
    expect(problems.join("\n")).toContain("file:../studio");
  });

  it("rejects a studio version outside the supported range", () => {
    const problems = studioDependencyProblems(
      { dependencies: { [STUDIO_NAME]: STUDIO_SPEC } },
      {
        packages: {
          [`node_modules/${STUDIO_NAME}`]: {
            version: "0.2.0",
            resolved: "https://registry.npmjs.org/lightmap-studio/-/lightmap-studio-0.2.0.tgz"
          },
          [WRAPPER_ENTRY]: { resolved: "..", link: true }
        }
      }
    );
    expect(problems.join("\n")).toContain("0.2.0 does not satisfy ^0.1.0");
  });

  it("rejects a second nested wrapper copy", () => {
    const problems = studioDependencyProblems(
      { dependencies: { [STUDIO_NAME]: STUDIO_SPEC } },
      {
        packages: {
          [`node_modules/${STUDIO_NAME}`]: {
            version: "0.1.0",
            resolved: "https://registry.npmjs.org/lightmap-studio/-/lightmap-studio-0.1.0.tgz"
          },
          [WRAPPER_ENTRY]: { resolved: "..", link: true },
          [`node_modules/${STUDIO_NAME}/node_modules/${WRAPPER_NAME}`]: {
            version: "0.2.0",
            resolved: "https://registry.npmjs.org/lightmapper-wasm/-/lightmapper-wasm-0.2.0.tgz"
          }
        }
      }
    );
    const message = problems.join("\n");
    expect(message).toContain(`nested ${WRAPPER_NAME} copy`);
    expect(message).toContain(WRAPPER_ENTRY);
  });
});
