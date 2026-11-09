import { defineConfig } from "vite";

const base = process.env.SITE_BASE || "/";

export default defineConfig({
  base,
  build: {
    target: "es2022",
    assetsInlineLimit: 0
  },
  // The package entries resolve their wasm assets with
  // `new URL(..., import.meta.url)`. Keeping them out of the dependency
  // optimizer leaves that expression intact so Vite emits the assets.
  optimizeDeps: {
    exclude: ["lightmapper-wasm", "xatlas-wasm"]
  },
  server: {
    host: "127.0.0.1",
    fs: {
      // The local `lightmapper-wasm: file:..` dependency is a symlink outside
      // the site root; the dev server must serve it and its wasm asset.
      allow: [".", ".."]
    }
  },
  preview: {
    host: "127.0.0.1"
  }
});
