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

## Refresh

```sh
npm run fetch:hdri --prefix site -- --check   # verify the checked-in file
npm run fetch:hdri --prefix site -- --force   # re-download and replace it
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
keeps the visible background sharp while avoiding softbox-grid aliasing in the
diffuse lightmap. Both paths agree in orientation.
