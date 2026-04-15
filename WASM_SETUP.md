# Lightmapper WASM Setup

## Current tool status

- CMake: installed
- Emscripten: not found in PATH

## Install Emscripten on Windows (PowerShell)

1. Clone emsdk:

   git clone https://github.com/emscripten-core/emsdk.git

2. Install and activate latest SDK:

   cd emsdk
   .\emsdk install latest
   .\emsdk activate latest

3. Load environment for current shell:

   .\emsdk_env.ps1

4. Verify tools:

   emcc --version
   emcmake --version

## Configure and build this project

From project root:

1. Configure:

   npm run configure:wasm

2. Build:

   npm run build:wasm

Expected artifacts under build folder:

- build/wasm/wasm/lightmapper_wasm.mjs
- build/wasm/wasm/lightmapper_wasm.wasm

## JavaScript API entry points

- Runtime wrapper: src/index.js
- Type definitions: types/index.d.ts

## Notes

- The wrapper is browser-first ESM.
- TGA file save helpers and JS callback-based hemisphere weights are intentionally not included in this first wrapper surface.

## Browser Example

A browser port of the native lightmapper sample is available at:

- examples/browser/index.html

The browser example keeps the original gazebo mesh and bake flow from the C sample and replaces GLFW input/render-loop behavior with native browser APIs (canvas, DOM events, requestAnimationFrame).

### Run the example

1. Build the wasm module:

   npm run rebuild:wasm

2. Serve the repository root over HTTP (do not use file://):

   npm run serve:demo

   If you prefer Python:

   python -m http.server 8080

3. Open:

   http://localhost:8080/examples/browser/index.html

### Controls

- Mouse drag: look around
- W, A, S, D, E, Q: movement
- Shift: faster movement
- Space or Bake button: start baking

### Troubleshooting

- Error: `WebGL2 is not available in this browser.`
   Cause: Browser, GPU, or driver does not expose WebGL2.
   Fix: Use a WebGL2-capable browser and update GPU drivers.

- Error: `Missing WebGL2 extension EXT_color_buffer_float.`
   Cause: Device/browser does not support float render targets needed by baking.
   Fix: Try another browser/GPU, disable remote desktop/virtualized GPU sessions, or run on hardware with this extension.

- Page works only partially or fails to load wasm/obj assets.
   Cause: Opened from `file://` or wrong server root.
   Fix: Serve the repository root over HTTP and open `http://localhost:8080/examples/browser/index.html`.

- Error mentioning bound context or context handle mismatch.
   Cause: WebGL context is not current for the wasm lightmapper call.
   Fix: Use `createLightmapperModule` with the demo canvas/context path and keep `autoRegisterEmscriptenContext` enabled.

- `npm run rebuild:wasm` fails with `emcc`/`emcmake` not found.
   Cause: Emscripten environment is not active in the current shell.
   Fix: Run `emsdk_env.ps1` first, then retry the build.
