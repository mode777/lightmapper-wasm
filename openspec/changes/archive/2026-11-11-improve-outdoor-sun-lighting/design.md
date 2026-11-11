# Design

## Context

See `proposal.md` — Why. The site-local harness currently draws an optional
equirectangular environment for every lightmapper hemicube face (AD-017), bakes
one context per lit object per bounce, and applies dilation and smoothing.
The display is bake-free (AD-015) and applies each mesh's albedo to the final
lightmap. The atlas is xatlas-shared (AD-016). The harness and display are
package-shaped but site-local; AD-018/AD-019 remain reserved for their
promotion.

`lightmapper.h` already exposes `lmSetHemisphereWeights`, but its default
`lm_defaultWeights` is all `1.0`. The JS wrapper currently omits the function
(documented as F7 in `docs/wasm-improvements.md`). The hemicube has one sample
per lightmap texel and a deterministic 3×3 rotation; the environment controls
what that sample sees, and the post-process controls how the result is spread.

The prerequisite changes `add-hdri-environment-baking` and
`add-sun-sky-outdoor-lighting` are implemented but not archived. Archive them
in that order before archiving this change so the main `showcase-site` spec
contains the environment and seven-scenario requirements this design builds on.

## Goals / Non-Goals

**Goals:**

- Make the outdoor sun/cloud feature well sampled by the hemicube without
  adding a shadow map or a second lighting model.
- Use lightmapper's own cosine hemisphere weighting so the diffuse response is
  physically correct and the low sun/horizon are not over-weighted.
- Reduce outdoor smoothing so structured sampling noise is not turned into
  multiple soft lobes.
- Preserve the display's visible procedural sun disk and full HDRI background.
- Preserve the existing lighting of the non-outdoor scenes by default.
- Keep the wasm/wrapper change additive and backward-compatible.

**Non-Goals:**

- Crisp or delta-sun shadows.
- A direct-light, shadow-map or analytic-light pass in the harness or display.
- Removing the sun from the environment or creating a second shadow source.
- A clear-sky HDRI asset or a new HDRI dependency.
- Changing the lightmapper header, the submodule, the loader, the npm entry or
  the published file layout.

## Decisions

### D1 — Stay inside lightmapper's hemicube

The harness remains a caller-drawn hemicube baker. It SHALL NOT add a separate
direct-light/deferred-shadow pass. All direct, environment and indirect light
continues to enter through the scene and environment drawn during `lmBegin` /
`lmEnd`. The display remains bake-free.

This is the key correction from the earlier direct-sun proposal: the sun stays
an environment feature, but the environment is made resolvable by the hemicube
and the integration is weighted correctly.

**Alternative considered:** a shadow map in lightmap UV space. Rejected: it
duplicates visibility outside lightmapper, adds a second lighting model and
forces a display/bake sun split. **Alternative:** a `[lightmapper]` multi-sample
hemisphere. Deferred as a future upstream option if the site-only recipe is
insufficient; it keeps the architecture but costs N× the bake.

### D2 — Bake a well-sampled area sun, not a near-delta disk

At H64 one hemicube texel is `90 / 64 = 1.406°`. The current `0.06 rad` sun is
`6.88°` across, about 4.9 texels, with a soft edge under two texels. That is
marginal: the disk is sampled at a different phase in every lightmap texel.

The bake uses a larger, softer sun lobe while the display keeps the current
disk:

| Variant | Angular radius | Diameter | H64 texels |
|---|---:|---:|---:|
| display `sun-sky-outdoor` | 0.06 rad | 6.88° | 4.9 |
| bake target at H64 | 0.22 rad | 25.2° | 17.9 |
| bake target at H128 | 0.22 rad | 25.2° | 35.8 |
| alternative: H128, 0.06 rad | 0.06 rad | 6.88° | 9.8 |

The bake lobe also gets a wider soft edge (`0.08 rad`) and a flux-preserving
intensity scale. The result
is one stable, softer shadow per occluder rather than multiple hemicube lobes.
The shadow is intentionally softer than the displayed disk; crispness is not a
goal for this change.

The HDRI path already prefiltered its sun/clouds to a broad lobe. It keeps a
wide prefiltered bake copy; the full HDRI remains the display background.

**Alternatives considered:** H128/H512 with the current small sun (preserves
the penumbra but 4×/64× cost; H128 remains the high preset); keeping the raw
0.06 rad bake sun and only reducing smoothing (leaves the sampling noise
exposed); a wider display sun (makes the visible sun obviously artificial).

### D3 — Use lightmapper's cosine hemisphere weights

Add a static cosine weight to the wasm shim:

```c
static float lmw_cosine_weight(float cos_theta, void *userdata) {
    (void)userdata;
    return cos_theta;
}

EMSCRIPTEN_KEEPALIVE void lmwSetCosineWeights(lm_context *ctx) {
    lmSetHemisphereWeights(ctx, lmw_cosine_weight, NULL);
}
```

The JS wrapper exposes `lmSetCosineWeights(ctx)` with the existing pointer,
context-binding and error checks. The harness gains:

```ts
hemisphereWeight?: "uniform" | "cosine"; // default "uniform"
```

After each `lmCreate`, the harness calls the wrapper method when the option is
`cosine`. The default stays `uniform`, so non-outdoor scenes keep their tuned
look. The outdoor scenes opt in and recalibrate their sun/sky exposure.

This consumes the upstream API rather than bypassing it; no `lightmapper.h`
change or submodule bump is needed. The weight table is part of the context and
is released by `lmDestroy`.

**Alternative considered:** exposing `lmSetHemisphereWeights` as a JS function
pointer callback. Rejected: unnecessary `addFunction`/lifetime complexity for a
single built-in weight. **Alternative:** changing the default weight globally.
Rejected: it would change every existing scene and AO bake.

### D4 — Reduce smoothing and spend quality on samples

The current outdoor presets use 4 smoothing passes for `sun-sky-outdoor` and 12
for `hdri-outdoor`, each followed by a dilation. That is a large blur and turns
structured hemicube variation into multiple soft lobes.

With a well-sampled bake sun:

- `sun-sky-outdoor`: four smoothing passes.
- `hdri-outdoor`: twelve smoothing passes. Four passes exposed fine diagonal
  lightmap line artifacts in the close-up render; the HDRI's dense cloud
  prefilter needs the original twelve.
- Keep dilation for chart-border coverage.
- Keep one fine interpolation pass unless it produces diamonds.
- Standard quality remains H64; high is H128. The preview remains H32.
- The three environment/outdoor scenes use 1024² atlases; the preview caps
  remain in place for draft captures.

The larger bake sun is the primary fix for the synthetic scene; smoothing only
removes residual banding. The exact pass counts and bake radius are tuned in
apply against the overhead and close-up visual checks. The sampling budget is
measured as:

```text
sunTexels = sunAngularDiameter / (90 / hemisphereSize)
```

The site scene test requires at least 6 texels for an outdoor bake sun at the
standard H64 and high H128 presets; the H32 preview is a draft capture and is
exempt. A failure names the computed coverage.

**Alternative considered:** more smoothing to hide the noise. Rejected: it
creates the multi-lobe look and softens the environment detail without
improving the sampling.

### D5 — Keep the HDRI scene honestly multi-source

`hdri-outdoor` uses a partly cloudy HDRI. Clouds are real, large area lights;
even a perfectly sampled sun still has soft cloud fill. The change keeps the
cloudy scene, uses a wider prefiltered bake copy if needed, reduces the
12-pass smoothing and documents that the scene is intentionally multi-source.
A clear-sky HDRI is a separate asset choice and out of scope.

`hdri-studio` keeps its current environment-only prefilter and smoothing; its
softboxes are intentionally multi-source.

### D6 — Display/bake environment variants

The environment resolver already returns a bake `environment` and a display
`texture`. The procedural scene generates the display data with the current
`0.06 rad` disk and the bake data with the larger soft lobe; the HDRI scene
uses the full decoded data for display and a wider prefiltered copy for the
bake. Both variants share direction, colors, intensity and bottom-up
orientation. Invalid source data is rejected before any GPU resource is
created.

This is an anti-aliasing split, not a direct-sun split: the bake environment
still contains the sun, just at a resolvable size. No separate shadow source is
introduced.

### D7 — Backward compatibility and wrapper surface

`hemisphereWeight` is optional and defaults to `uniform`; scenes without it
produce the previous result. The wrapper method is additive. The wasm export
list and handwritten types are updated, but the default entry, files list and
loader behavior are unchanged. The site still consumes the tested `dist`
artifact.

### D8 — Verification

The change affects the wasm shim, the wrapper API and rendering. Verification
covers both the root package and the site, headless on ANGLE SwiftShader:

- Root: rebuild the wasm and dist; `npm test`, `test:dist`, `test:shader`,
  `test:readback`, `test:loader`, `test:consumer`, `typecheck`.
- Site: `npm run check`, `npm test`, `test:harness`, `test:smoke`, production
  build and build check.
- Scene tests: sampling budget, cosine weighting, display/bake variants,
  reduced smoothing, one-soft-shadow classification, thumbnails.
- Full `npm run verify:remote`.
- No C header or submodule change; confirm with a diff check.

## Risks / Trade-offs

- **Softer shadows than the displayed sun** → accepted trade-off; use a
  bake-only soft lobe and document that the bake is anti-aliased. Keep H128 as
  the high-quality option for a tighter penumbra.
- **Cosine weighting changes exposure and shadow contrast** → recalibrate the
  outdoor sun/sky intensity and verify the overall exposure against the current
  bake. Keep non-outdoor scenes uniform.
- **The bake sun becomes visibly larger than the display disk** → keep the
  display at `0.06 rad`; the bake radius is `0.22 rad` with total flux preserved
  by scaling the disk intensity, and the stage capture is reviewed rather than
  making the display sun artificial.
- **Partly cloudy HDRI still has multiple soft cloud shadows** → documented
  policy; clear-sky HDRI is out of scope.
- **H128 high preset is slower** → standard stays H64; high is explicit; the
  preview stays H32.
- **Wasm/wrapper API addition** → additive method, root smoke/loader/consumer
  checks, type declarations; no entry or file layout change.
- **Sampling-budget measurement for the HDRI is approximate** → use the
  declared prefilter kernel/effective bright-region width and keep a
  conservative minimum; the procedural scene has an exact descriptor.
- **Thumbnail invalidation** → `site/src/demos/types.ts` is shared, so all
  seven thumbnails must be recaptured; keep `PREVIEW_VERSION` unless the
  preview viewport/material/CSS changes.
- **Archive order** → archive the two completed prerequisite changes first,
  then this change, or the main specs will not contain the environment and
  seven-scenario requirements.

## Migration Plan

This is additive. Existing scenes keep the uniform weight and current
environment behavior because the option defaults to `uniform`. Roll back by
removing the outdoor opt-in and the wrapper method; the environment-only
results remain valid. The wasm artifact and `dist` are rebuilt, but the
published entry points and file layout are unchanged.

Archive order: `add-hdri-environment-baking` → `add-sun-sky-outdoor-lighting`
→ `improve-outdoor-sun-lighting`.

## ADR Impact

Add **AD-020 — Well-sampled area sun and cosine weighting in the showcase** to
`docs/decisions.md` in this change. It extends AD-017 and does not supersede
it: the environment remains the lighting input, but the sun is made resolvable
and diffuse integration uses lightmapper's cosine weights. It does not change
the `add-sun-sky-outdoor-lighting` D1 decision that the sun is part of the
environment. AD-018/AD-019 remain reserved for the harness/display promotion.
No `[lightmapper]` header change or submodule bump is part of this decision.

## Open Questions

None. The bake-sun radius, flux scale, prefilter width and smoothing counts
were tuned in apply against the overhead visual check; the final values are
recorded above and in the scene.
