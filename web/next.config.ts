import type { NextConfig } from 'next';

/** Data files are content-addressed by the pipeline run that produced them; a year of caching is safe. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Local serving of web/public/data (npm start, the venue laptop); in production R2 sends the same header.
      { source: '/data/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
    ];
  },
};

export default nextConfig;
