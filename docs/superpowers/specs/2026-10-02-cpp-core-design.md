# Earthrise: the C++ core (2 October 2026, to be built after part A)

Approved with the immersive design (`2026-10-02-immersive-space-design.md`, section 3.4): the two heaviest calculations move to one C++ library, used by the browser through WebAssembly and by the pipeline through a C ABI. Nothing a person sees changes except speed; every result stays what the TypeScript and NumPy code compute today, and tests hold the four paths together.

## 1. Why

- **Shadow sweep** (part 3's running maximum of the ground's rise towards the Sun, over the window, context and cap levels): 37 ms at half resolution and 135 ms at full per hour in the browser worker today. Target 12 ms and 45 ms, so Explore's shadow map and the stand view can follow Play hour by hour at the full level.
- **Horizon march** (720 directions across the nested 20 m, 80 m and 240 m tiles, with the Moon's curvature): about 2 s cold for a point the user picks. Target under 0.6 s, and it also returns, for each direction, the distance of the point that makes the skyline.
- **The pipeline**: the same code makes the masks, the shadow fixtures and the home page's assets faster, and makes the reference implementation and the shipped one the same code.

## 2. Scope

In: the shadow sweep, the horizon march, and the small helpers they need (tile sampling, curvature, the Sun disc fraction, the percentile used by the shading). Out: the ephemeris interpolation, the hourly series, the power budget and the best-landing search (fast enough in TypeScript), GPU compute, threads.

Today's code, which the C++ must match:

| Calculation | TypeScript (web) | Python (pipeline) |
|---|---|---|
| shadow sweep | `web/src/lib/engine/shadow.ts`, `shadow-handler.ts` | `pipeline/lunar_pipeline/shadow.py` |
| horizon march | `web/src/lib/engine/horizon.ts`, `tiles.ts` | `pipeline/lunar_pipeline/horizon.py`, `masks.py` |

## 3. Layout

```
native/
  include/earthrise/shadow.h, horizon.h, capi.h   C++17 headers; capi.h is plain C
  src/shadow.cpp, horizon.cpp, capi.cpp
  tests/core_test.cpp                             a small self-contained test runner (no framework)
  build.py                                        builds the WebAssembly module and the shared library
  VERSION                                         the Emscripten and compiler versions the outputs were built with
web/src/wasm/earthrise-core.mjs, .wasm            committed build output (about 0.3 MB), so npm run build needs no C++
pipeline/lunar_pipeline/native.py                 ctypes loader with NumPy fallback
pipeline/lunar_pipeline/_native/                  the built .dll/.so (not committed; build.py makes it)
```

## 4. The C ABI

Plain C functions over flat arrays, so WebAssembly, `ctypes` and any future binding call the same thing. Heights are float32 metres in the site's frame, row-major; outputs are written into caller-owned buffers; every function returns 0 on success or a negative error code.

```c
// Fraction of the Sun's disc in view for every cell of one height level.
int er_shadow_sweep(const float *heights, int width, int height, double cell_m,
                    double site_col, double site_row, double sun_bearing_deg,
                    double sun_el_deg, double sun_radius_deg, int half, float *out_fraction);

// Tiles for the horizon march: the caller decodes them (as today) and hands them over.
typedef struct er_tiles er_tiles;
er_tiles *er_tiles_create(void);
int er_tiles_put(er_tiles *t, int level, int tile_x, int tile_y, const int16_t *dn,
                 int size, double scale_m, double offset_m);
void er_tiles_free(er_tiles *t);

// The site's horizon: elevation (degrees) and the skyline point's distance (m) for n_az directions.
int er_horizon_march(const er_tiles *t, double lat_deg, double lon_deg, double mast_m,
                     int n_az, float *out_el_deg, float *out_dist_m);
```

The plan fixes the exact parameter lists against the TypeScript signatures; the rule is that each C function maps one to one onto a function that exists today.

## 5. Builds

- **WebAssembly**: Emscripten (installed at `C:\Users\user\tools\emsdk`, version recorded in `native/VERSION`), `-O3 -msimd128 -flto`, an ES module factory (`-sMODULARIZE -sEXPORT_ES6`), memory growth on (tiles stream in), environments web, worker and node (so vitest runs it).
- **Shared library**: MinGW-w64 g++ (`C:\msys64\mingw64`) on Windows, `-O3 -shared -static-libgcc -static-libstdc++`; `-fPIC` `.so` or `.dylib` elsewhere. The C ABI keeps the compiler's C++ ABI out of Python's way.
- Numbers: double precision wherever the TypeScript uses JavaScript numbers, so results match to the last digit the fixtures check; SIMD only where the result is exact (comparisons and maxima).

## 6. How the app and the pipeline use it

- **Browser**: `shadow.worker.ts` and `engine.worker.ts` load the module once; if it fails to load or a call returns an error, they fall back to the TypeScript code for good and say so in the console. `?engine=ts` forces the TypeScript path, for comparison.
- **Pipeline**: `native.py` loads the library when present (`EARTHRISE_NATIVE=0` turns it off); `masks.py` and `shadow.py` call it, else NumPy.

## 7. Tests

- **Parity**: the existing golden fixtures (masks within 0.0005°, the part 3 shadow fixtures and acceptance pixel) run against all four paths: TypeScript, WebAssembly (in vitest, Node), NumPy and the shared library (pytest). They must agree within the fixtures' tolerances; shadow fractions within 1/255.
- **Edge cases**: a flat level (everything lit above 0°), a single wall (the analytic edge), the Sun below the horizon, a site at a level's edge, a level with missing cells.
- **Staleness**: a test hashes `native/src` and `native/include` and compares the hash stored beside the committed `.wasm`; it fails when the sources changed and the module was not rebuilt.
- **Speed**: a benchmark script (not a test) times the sweep at both levels and the march for a custom site in Node and in the browser worker, and records the figures in the pull request.

## 8. Delivery

One plan and one pull request after part A, merged on green: build script and C ABI first, then the shadow sweep with parity, then the horizon march with parity, then the workers' switch-over with the fallback, then the pipeline loader. Each step keeps the app working on the old path.

## 9. Risks

- **Toolchain drift**: the Emscripten and compiler versions are pinned in `native/VERSION`; the committed module means a machine without them still builds the app.
- **Float differences**: double precision and the parity tests catch them before they reach a result.
- **WebAssembly memory**: the march streams only the tiles it needs; memory growth is capped at 1 GB.
