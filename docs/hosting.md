# Hosting Earthrise

Earthrise is a static-first Next.js app with two small server routes (`/api/chat`, `/api/horizons`) and about 250 MB of data files (ephemeris table, skyline masks, DEM tiles, terrain rasters, validation tables). The app runs on Vercel's free Hobby plan; the data lives in a Cloudflare R2 bucket (free tier, no egress fees) and is fetched by the browser from `NEXT_PUBLIC_DATA_BASE`. The same build runs offline on the venue laptop with the data mirrored into `web/public/data`.

Nothing in this document has been run yet: it prepares the go-live steps for the team to execute. Keys and account ids never go into the repository.

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

4. Fill the local mirror, then preview and run the upload from `pipeline/`:

   ```powershell
   uv run python -m lunar_pipeline.cli sync-local --tiles
   uv run python -m lunar_pipeline.cli publish-r2 --dry-run
   uv run python -m lunar_pipeline.cli publish-r2
   ```

   The publisher walks `web/public/data`, uploads every file under the `data/` prefix with its content type and `Cache-Control: public, max-age=31536000, immutable`, and skips files whose size and MD5 already match the object in the bucket. Re-running it after a pipeline change uploads only what changed.

5. Public access. `r2.dev` URLs are rate-limited and not meant for production, so use one of:
   - **Custom domain** on the bucket (Settings → Public access → Custom domains), for example `data.earthrise.example`. Cloudflare then serves the objects through its CDN with the headers set at upload.
   - **Worker in front of the bucket** when there is no domain yet. A ten-line Worker binds the bucket and forwards `GET`/`HEAD` (see below).

6. CORS on the bucket (Settings → CORS policy), so the app's origin may fetch the files:

   ```json
   [
     {
       "AllowedOrigins": ["https://earthrise.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   Add the production domain to `AllowedOrigins` when it exists.

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

Bind the bucket as `DATA` in the Worker's settings. Either way, the app's `NEXT_PUBLIC_DATA_BASE` becomes `https://<host>/data`.

## 2. App on Vercel (Hobby)

1. Import the GitHub repository in Vercel. **Root directory: `web`.** Framework preset: Next.js. Build command `npm run build`, install command `npm install` (the repo's `.npmrc` already sets `legacy-peer-deps`).
2. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `OPENROUTER_API_KEY` | the OpenRouter key (server only; never exposed) |
   | `OPENROUTER_MODELS` | `google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,qwen/qwen3.8-27b:free,nvidia/nemotron-3.5-lightning:free` |
   | `NEXT_PUBLIC_AI_MODE` | `live` (`cached` turns the planner into rehearsed answers only) |
   | `AI_RATE_LIMIT_PER_MIN` | `30` |
   | `NEXT_PUBLIC_DATA_BASE` | `https://<data host>/data` |

3. `web/vercel.json` adds the immutable cache header for `/data/*` (only used if the data is ever served by the app) and a one-hour header for the test badge. `web/.vercelignore` keeps the local data mirror out of CLI deployments; Git deployments never see it because `public/data` is gitignored.
4. Region: leave the default (`iad1`); the routes are light and JPL Horizons sits in the same region.
5. Limits to keep in mind on Hobby: 100 GB of transfer per month (the data does not count, it comes from R2), 100 MB of source per deployment, 10 s default function duration on Fluid compute (the chat route spends at most two 10 s model calls, so set **Function max duration to 30 s** in the project settings, which Hobby allows for Fluid functions).
6. After the first deployment, open `/validate`, press **Re-check with JPL now**, and ask the planner one question on `/explore` to confirm both routes and the key.

## 3. GitHub Release mirror

Publishing the data as a GitHub Release keeps a second copy the venue laptop can download without Cloudflare:

```powershell
cd web/public
tar -a -cf ../../data-2026-11.zip data
gh release create data-2026-11 ../../data-2026-11.zip --title "Earthrise data 2026-11" --notes "LOLA tiles, masks, ephemeris, terrain, validation tables"
```

Release assets may be up to 2 GB each; the zip is about 250 MB.

## 4. Offline venue mode

The venue may have no usable Wi-Fi. Prepare two laptops (and a USB stick with the zip) like this:

```powershell
cd pipeline; uv run python -m lunar_pipeline.cli sync-local --tiles; cd ../web
npm run build
$env:NEXT_PUBLIC_AI_MODE = "cached"    # rehearsed planner answers, no network
npm start                              # serves http://localhost:3000 with /data from public/data
```

Open `http://localhost:3000/explore?demo=1`. The Validate page's live re-check needs the internet; without it the page shows the stored comparison and says so. The Horizons fixtures and the validation tables are in the data mirror, so every table renders offline.

## 5. Plan B: Cloudflare Pages

If Vercel's transfer or function limits bite, the app can move next to the data: `@opennextjs/cloudflare` builds the Next.js app for Cloudflare Workers/Pages (unlimited free bandwidth, 100k requests a day on the free plan). The two API routes work unchanged; `AbortSignal.timeout` and `fetch` are available in the Workers runtime. The data layer does not change at all.

## 6. Go-live checklist

- [ ] R2 bucket created, token issued, `publish-r2 --dry-run` reviewed, `publish-r2` run, one file opened in the browser with the immutable header.
- [ ] CORS policy saved with the Vercel origin; custom domain or Worker in front of the bucket.
- [ ] Vercel project imported with root `web`; environment variables set; function max duration 30 s.
- [ ] First deployment: `/explore` loads a site from R2, `/validate` re-checks against JPL, `/explore` answers a planner question with "answered by …".
- [ ] `?demo=1` on the live URL answers from the rehearsed transcripts.
- [ ] GitHub Release with the data zip; both venue laptops run `npm start` offline from the zip.
- [ ] Project page updated with the live URL and the repository link.

## 7. Costs

Everything above is free at this size: Vercel Hobby, R2 under 10 GB stored and 10 million reads a month, Workers under 100k requests a day, GitHub Releases. A custom domain is about $10 a year; Vercel Pro ($20 a month) only if the free transfer runs out during the event.
