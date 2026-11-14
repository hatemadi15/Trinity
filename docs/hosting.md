# Hosting Earthrise

Earthrise is a static-first Next.js app with two small server routes (`/api/chat`, `/api/horizons`) and about 282 MB of data files (ephemeris table, horizon masks, DEM tiles, terrain rasters, validation tables, the margins and terrain versions, the modelled cold traps), listed file by file, with sizes and SHA-256 hashes, in `data/manifest.json`. The app is meant to run on Vercel's free Hobby plan, with the data in a Cloudflare R2 bucket (free tier, no egress fees) that the browser reads from `NEXT_PUBLIC_DATA_BASE`. The same build runs without a network on a prepared laptop with the data mirrored into `web/public/data` (section 4).

Two ways to run it, which differ offline:

- **A prepared local laptop** (section 4): the data and a production build are on the machine, and `npm start` serves both. It runs with no network at all. Checked on 14 November 2026 on Linux: a build from an empty `web/.next` and `next start` inside a network namespace with no network (`unshare -n`), and the pages opened there in Chromium (`docs/demo-checklist.md` has the venue steps).
- **The hosted site** (sections 1 and 2): it needs the network. It has no service worker and no offline cache, so a visitor without a connection cannot open it, and an open tab cannot fetch data it has not loaded yet. A browser's ordinary cache may keep files it has already fetched (the data files are sent as immutable for a year), but the site promises nothing offline.

What was run on 14 November 2026, and what was not:

- Run here: `npm run build` and `npm start` with the full data (`check-data` says "The full demo is here."), the offline build and serve above, `publish-r2 --dry-run` with no keys set (it lists 889 files, 282.2 MB, and needs no account), and `publish-r2` without keys, which stops before any network use with `missing environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET`.
- Not run, because they need the team's accounts and keys: creating the R2 bucket, the upload itself, CORS, a custom domain or Worker, the Vercel project, its environment variables and a deployment. No Vercel project for Earthrise existed in the team's connected Vercel account on 14 November.
- `https://earthrise.vercel.app`, which the app falls back to for its share image when `NEXT_PUBLIC_SITE_URL` is unset, serves an unrelated app on 14 November. The Vercel project will get another address: set `NEXT_PUBLIC_SITE_URL` to it (section 2) and add it to the bucket's CORS origins (section 1).
- The repository `https://github.com/hatemadi15/Trinity` is private on 14 November and has no releases: make it public (or the judges cannot clone it) and publish the data zip (section 3).

Keys and account ids never go into the repository.

## 1. Data on Cloudflare R2

1. In the Cloudflare dashboard create a bucket, for example `earthrise-data`, in the location closest to Beirut (WEUR or EEUR).
2. Create an R2 API token with **Object Read & Write** on that bucket. Note the account id, access key id and secret access key.
3. Put them in the shell (never in a file that is committed):

   ```powershell
   $env:R2_ACCOUNT_ID = "<account id>"
   $env:R2_ACCESS_KEY_ID = "<access key id>"
   $env:R2_SECRET_ACCESS_KEY = "<secret>"
   $env:R2_BUCKET = "earthrise-data"
   ```

4. Fill the local mirror, check it against the manifest, then preview and run the upload from `pipeline/` (the same lines in every shell). Name the prefix after the manifest's data version, which `check-data` prints on its first line (`2026-11-14-730a29df` for the data of 14 November):

   ```powershell
   uv run python -m lunar_pipeline.cli sync-local --tiles
   uv run python -m lunar_pipeline.cli check-data
   uv run python -m lunar_pipeline.cli publish-r2 --dry-run --prefix data-2026-11-14-730a29df
   uv run python -m lunar_pipeline.cli publish-r2 --prefix data-2026-11-14-730a29df
   ```

   `check-data` should end with "The full demo is here."; if it names a part as missing or incomplete, the hosted site would fall back there too (it says how). The dry run needs no keys.

   `sync-local --tiles` copies the committed data, the DEM tiles and the terrain rasters into the mirror. The publisher walks `web/public/data`, uploads every file under the prefix you name (`data/` if you name none) with its content type and `Cache-Control: public, max-age=31536000, immutable`, and skips files whose size and MD5 already match the object in the bucket. It uploads whatever the folder holds, so first delete what an older mirror may still hold and no page reads: `globe/` (the Moon the home page's arrival drew until 14 November) and the terrain's two `de_gerlache_rim_2.flight` files (that arrival's 240 m flight level). The home page's descent draws from pictures that ship with the app (`web/public/hero` and `web/public/maps`), not from the data. The commands above publish under `data-2026-11-14-730a29df`, so `NEXT_PUBLIC_DATA_BASE` then points at `https://<data host>/data-2026-11-14-730a29df`; the mirror's `manifest.json` goes up with the rest, so the published data carries its own list. Files keep their names when the pipeline regenerates them, and a browser keeps its copy for a year, so publish a changed data run under a new prefix (the manifest's new data version: `uv run python -m lunar_pipeline.cli manifest` writes it) and point `NEXT_PUBLIC_DATA_BASE` at it: no browser then mixes old and new files. Naming the first run too means the second never collides with it. Re-running with the same prefix uploads only what changed, which is safe only before anyone has loaded the data. (When the app serves `web/public/data` itself, as on the venue laptop, `next.config.ts` makes the browser check every file again, so a rebuilt mirror shows at once.)

5. Public access. `r2.dev` URLs are rate-limited and not meant for production, so use one of:
   - **Custom domain** on the bucket (Settings → Public access → Custom domains), for example `data.earthrise.example`. Cloudflare then serves the objects through its CDN with the headers set at upload.
   - **Worker in front of the bucket** when there is no domain yet. A ten-line Worker binds the bucket and forwards `GET`/`HEAD` (see below).

6. CORS on the bucket (Settings → CORS policy), so the app's origin may fetch the files:

   ```json
   [
     {
       "AllowedOrigins": ["https://<the project's own address>", "http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   Add the production domain to `AllowedOrigins` when it exists.

   Vercel preview deployments have their own origins (`https://<project>-<hash>-<team>.vercel.app`). R2's CORS policy documents `*` and exact origins. A partial wildcard such as `https://*.vercel.app` is not documented as supported, so do not rely on it. For previews, either serve the data through the Worker below (it answers `Access-Control-Allow-Origin: *`) or add each preview origin you test from to `AllowedOrigins`.

Worker (only when no custom domain is attached):

```js
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    const key = new URL(request.url).pathname.slice(1);
    const object = await env.DATA.get(key);
    if (!object) return new Response('not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(object.body, { headers });
  },
};
```

Bind the bucket as `DATA` in the Worker's settings. Either way, the app's `NEXT_PUBLIC_DATA_BASE` becomes `https://<host>/data-2026-11-14-730a29df`.

## 2. App on Vercel (Hobby)

One rule first: every `NEXT_PUBLIC_*` variable is inlined into the client and server bundles at build time. Set them before the first build and trigger a new build after changing one; a runtime change alone does nothing.

1. Node. Next 16 needs Node 20.9 or later; `web/package.json` sets `"engines": { "node": ">=20.9.0 <27" }`. On 12 November a clean install, a slice of the tests and the production build passed on Node 20, 24 and 26 and the full suite on 22, with Next 16.3.6; since the bump to Next 16.4.6 (14 November) only Node 22 has been checked. Vercel reads it to pick the runtime from that range (Settings, General, Node.js Version shows which). The team works on 22 (`web/.nvmrc`); the venue laptops can run any of them.
2. Import the GitHub repository in Vercel. **Root directory: `web`.** Framework preset: Next.js. Build command `npm run build`, install command `npm install` (the repo's `.npmrc` already sets `legacy-peer-deps`).
3. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `OPENROUTER_API_KEY` | the OpenRouter key (server only; never exposed) |
   | `OPENROUTER_MODELS` | `qwen/qwen3.8-27b:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,nvidia/nemotron-3.5-lightning:free` |
   | `NEXT_PUBLIC_AI_MODE` | `live` (`cached` turns the planner into rehearsed answers only) |
   | `AI_RATE_LIMIT_PER_MIN` | `30` |
   | `AI_MODEL_BUDGET_MS` | `24000` (optional; total model time per `/api/chat` request in milliseconds, first answer plus one retry, kept under the browser's 30 s wait) |
   | `AI_MODEL_TIMEOUT_MS` | `10000` (optional; how long one model in the chain may take, in milliseconds, before the next one is asked; all of them stay inside `AI_MODEL_BUDGET_MS`) |
   | `NEXT_PUBLIC_DATA_BASE` | `https://<data host>/data-2026-11-14-730a29df`, the prefix the data was published under (no trailing slash; the app strips one and reads an empty value as `/data`) |
   | `NEXT_PUBLIC_SITE_URL` | the project's own address, for example `https://<project>.vercel.app` (the address people open, which the share image's link is built on). Set it: unset or empty, the app falls back to `https://earthrise.vercel.app`, which is an unrelated site |

4. `web/vercel.json` adds the immutable cache header for `/data/*` (only used if the data is ever served by the app) and a one-hour header for the test badge. `web/.vercelignore` keeps the local data mirror out of CLI deployments; Git deployments never see it because `public/data` is gitignored.
5. Region: leave the default (`iad1`); the routes are light and JPL Horizons sits in the same region.
6. Limits to keep in mind on Hobby: 100 GB of transfer per month (the data does not count, it comes from R2), 100 MB of source per deployment. Function duration needs no change: Hobby with Fluid compute allows up to 300 s, the chat route caps itself at 60 s (`maxDuration`) and keeps its model time under 24 s per request so the browser's 30 s wait is never exceeded.
7. After the first deployment, open `/validate` (the Accuracy page), press **Re-check with JPL now**, and ask the assistant one question on `/explore` to confirm both routes and the key.

## 3. GitHub Release mirror

Publishing the data as a GitHub Release keeps a second copy the venue laptop can download without Cloudflare:

```powershell
cd web/public
tar -a -cf ../../data-2026-11.zip data
gh release create data-2026-11 ../../data-2026-11.zip --title "Earthrise data 2026-11" --notes "LOLA tiles, masks, ephemeris, terrain, validation tables"
```

`tar -a` makes a zip on Windows 10 and 11 and on macOS; on Linux, `cd web/public && python3 -m zipfile -c ../../data-2026-11.zip data` does the same. Release assets may be up to 2 GB each; the zip is about 280 MB. The zip holds the mirror's `manifest.json`: after unzipping it into `web/public`, `uv run python -m lunar_pipeline.cli check-data` in `pipeline/` compares the files with the repository's `data/manifest.json` and says whether every one arrived whole (use a zip of the same data version as the checkout). No release existed on 14 November.

## 4. Offline venue mode

The venue may have no usable Wi-Fi. This is the prepared local laptop: the data and the build are on the machine, so it needs no network (the hosted site, by contrast, does not work offline). Prepare two laptops (and a USB stick with the zip) like this; the setup itself (cloning, `npm ci`, the downloads) needs a connection, the build does not, since the fonts are in the repository. On a fresh clone `sync-local --tiles` stops with `data_out/tiles missing`: download and build the data first (the README's "Run it on your computer", step 3), or unzip the release's zip into `web/public` and run `cd web` in place of the first line.

```powershell
cd pipeline; uv run python -m lunar_pipeline.cli sync-local --tiles; uv run python -m lunar_pipeline.cli check-data; cd ../web
$env:NEXT_PUBLIC_AI_MODE = "cached"    # rehearsed planner answers, no network; must be set BEFORE the build (inlined at build time)
npm run build
npm start                              # serves http://localhost:3000 with /data from public/data
```

A value set in the shell wins over `web/.env.local` at build time (checked with Next 16.3.6: a shell set to `cached` built `cached` over a file that said `live`, and a shell set to `live` built `live` over a file that said `cached`). Without one in the shell, the file's value is built in, so a `web/.env.local` copied from `.env.example`, which says `live`, gives a live build unless the shell sets `cached` as above. `?demo=1` in the URL also switches the planner to rehearsed answers for the tab, whatever the build says.

`check-data` should end with "The full demo is here." Open `http://localhost:3000/explore?demo=1`. Three things still need the internet and say so without it: the Accuracy page's live re-check (the page keeps the stored comparison), the assistant's model (`cached` and `?demo=1` use the rehearsed answers instead), and Luna's speech recognition in Chrome and Edge (her panel takes typed words). The validation tables are in the data mirror, so every table renders offline.

## 5. Plan B: Cloudflare Pages

If Vercel's transfer or function limits bite, the app can move next to the data: `@opennextjs/cloudflare` builds the Next.js app for Cloudflare Workers/Pages (unlimited free bandwidth, 100k requests a day on the free plan). The two API routes work unchanged; `AbortSignal.timeout` and `fetch` are available in the Workers runtime. The data layer does not change at all.

## 6. Go-live checklist

- [ ] R2 bucket created, token issued, `publish-r2 --dry-run` reviewed, `publish-r2` run, one file opened in the browser with the immutable header.
- [ ] CORS policy saved with the Vercel origin; custom domain or Worker in front of the bucket.
- [ ] Vercel project imported with root `web`; environment variables set before the first build (they are inlined at build time); function duration left at the default.
- [ ] First deployment: `/explore` loads a site from R2, `/validate` re-checks against JPL, `/explore` answers a question to the assistant with "answered by …".
- [ ] A preview deployment opened `/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10` and the ground drew (CORS and the prefix are right).
- [ ] `?demo=1` on the live URL answers from the rehearsed transcripts.
- [ ] `check-data` on the mirror ends with "The full demo is here." before `publish-r2`.
- [ ] `NEXT_PUBLIC_SITE_URL` set to the project's own address (not `earthrise.vercel.app`, an unrelated site), and that address in the bucket's CORS origins.
- [ ] GitHub Release with the data zip; both venue laptops run `npm start` offline from the zip, and `check-data` passes on each.
- [ ] The repository made public (private on 14 November), so the judges can open and clone it.
- [ ] Project page updated with the live URL and the repository link (`docs/submission.md` lists what is still to fill).

## 7. Costs

Everything above is free at this size: Vercel Hobby, R2 under 10 GB stored and 10 million reads a month, Workers under 100k requests a day, GitHub Releases. A custom domain is about $10 a year; Vercel Pro ($20 a month) only if the free transfer runs out during the event.
