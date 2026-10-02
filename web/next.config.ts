import type { NextConfig } from 'next';

/**
 * Data files keep their names when the pipeline regenerates them, so a browser must check them again
 * on every load (a 304 when unchanged); a year of immutable caching kept an old terrain manifest after
 * the terrain was rebuilt. Hosted data on R2 keeps a year's caching, so each changed data run is
 * published under a new prefix (docs/hosting.md).
 */
const REVALIDATE = 'public, max-age=0, must-revalidate';

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Local serving of web/public/data (npm start, the venue laptop).
      { source: '/data/:path*', headers: [{ key: 'Cache-Control', value: REVALIDATE }] },
    ];
  },
};

export default nextConfig;
