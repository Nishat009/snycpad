import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // REST calls go through Next so the auth cookie is first-party.
  // The WebSocket connects to the server directly (see lib/collab/provider.ts).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'api.dicebear.com' }] },
};

export default nextConfig;
