/**
 * Mock filesystem helpers built on top of `memfs`.
 *
 * Usage in a test file:
 *
 *   import { vi } from "vitest";
 *   import { mockFs, resetFs, seedFs } from "../helpers/mock-fs.js";
 *
 *   mockFs();   // installs vi.mock("fs") + "fs/promises" with memfs backing
 *
 *   beforeEach(() => {
 *     resetFs();
 *     seedFs({ "/app/user-config.json": JSON.stringify({ ... }) });
 *   });
 *
 * `mockFs()` MUST be called at the top of the test module (it sets up the
 * vi.mock factory). Vitest hoists vi.mock automatically, so call order in the
 * file doesn't matter — but it must be in module scope, not inside a hook.
 */

import { vi } from "vitest";
import { fs as memFs, vol } from "memfs";

let installed = false;

export function mockFs() {
  if (installed) return;
  installed = true;

  vi.mock("fs", async () => {
    const memfs = await import("memfs");
    return {
      ...memfs.fs,
      default: memfs.fs,
    };
  });

  vi.mock("fs/promises", async () => {
    const memfs = await import("memfs");
    return {
      ...memfs.fs.promises,
      default: memfs.fs.promises,
    };
  });
}

export function resetFs() {
  vol.reset();
}

export function seedFs(files) {
  vol.fromJSON(files);
}

export function readFile(path) {
  return memFs.readFileSync(path, "utf8");
}

export function fileExists(path) {
  return memFs.existsSync(path);
}

export function listFiles(dir = "/") {
  try {
    return memFs.readdirSync(dir);
  } catch {
    return [];
  }
}

export { memFs, vol };
