# HDRI environments

## studio_small_09_1k.hdr

- **Source:** Poly Haven, <https://polyhaven.com/a/studio_small_09>
- **API endpoint:** <https://api.polyhaven.com/files/studio_small_09>
  (`hdri["1k"].hdr.url`)
- **Author:** Sergej Majboroda
- **License:** CC0 1.0 Universal (public-domain dedication)
- **Downloaded size:** 1,615,248 bytes
- **MD5:** `d5d7eb9d26d341d6aa4d11c1a54fd97c`
- **Resolution:** 1024 × 512 (equirectangular Radiance RGBE)

The HDRI is checked in and served by the showcase from its own origin. The
site never downloads it from Poly Haven at runtime.

## kloofendal_48d_partly_cloudy_puresky_1k.hdr

- **Source:** Poly Haven, <https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky>
- **API endpoint:** <https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky>
  (`hdri["1k"].hdr.url`)
- **Authors:** Greg Zaal (original), Jarod Guest (sky edits)
- **License:** CC0 1.0 Universal (public-domain dedication)
- **Downloaded size:** 1,435,119 bytes
- **MD5:** `c69498687e876bf68d2a8b8a62234eb9`
- **Resolution:** 1024 × 512 (equirectangular Radiance RGBE)
- **Content:** high-contrast midday sky with a visible sun, scattered cumulus
  clouds and a dim sky fill below the horizon. This is the Pure Sky variant: the
  photographed ground, grass and hills are removed, so the showcase scene
  supplies the only ground plane.

The HDRI is checked in and served by the showcase from its own origin. The
site never downloads it from Poly Haven at runtime.

## qwantani_dusk_2_puresky_1k.hdr

- **Source:** Poly Haven, <https://polyhaven.com/a/qwantani_dusk_2_puresky>
- **API endpoint:** <https://api.polyhaven.com/files/qwantani_dusk_2_puresky>
  (`hdri["1k"].hdr.url`)
- **Authors:** Greg Zaal (photography), Jarod Guest (processing)
- **License:** CC0 1.0 Universal (public-domain dedication)
- **Downloaded size:** 1,166,018 bytes
- **MD5:** `d400530e33f683654e70b4a087b6fe8d`
- **Resolution:** 1024 × 512 (equirectangular Radiance RGBE)
- **Content:** low-contrast blue-hour dusk sky with a warm band along the
  horizon, thin clouds and no visible sun disk. This is the Pure Sky variant:
  the photographed ground is removed, so the dusk scene supplies the only
  ground plane.

The HDRI is checked in and served by the showcase from its own origin. The
site never downloads it from Poly Haven at runtime.

## Refresh

```sh
npm run fetch:hdri --prefix site -- --check   # verify all checked-in HDRIs
npm run fetch:hdri --prefix site -- --force   # re-download and replace all
npm run fetch:hdri --prefix site -- --check --asset=kloofendal_48d_partly_cloudy_puresky
npm run fetch:hdri --prefix site -- --force --asset=qwantani_dusk_2_puresky
```

The script resolves the download URL through the Poly Haven API and verifies
the expected size and MD5 before replacing the checked-in file.

## Runtime orientation

The Radiance file stores scanlines top-down. The site decodes it once and flips
the rows into the bottom-up convention used by the bake skybox and the
three.js equirectangular background:

- row 0 is the south pole (`v = 0`)
- the last row is the north pole (`v = 1`)
- the data is linear RGBA float radiance; the intensity multiplier is applied
  separately by the bake and display paths

The display reads the full normalized array. The bake uses a 128 × 64
box-filtered and blurred irradiance copy of the same bottom-up data, which
keeps the visible background sharp while avoiding softbox/sun-grid aliasing in
the diffuse lightmap. Both paths agree in orientation.
