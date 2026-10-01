/** @type {import('next').NextConfig} */

// Served under /waitlist so it can sit behind the main app's path proxy (ennoia.live/waitlist).
// basePath prefixes routing, _next assets, next/link and next/image automatically; raw string
// refs to /public assets and manual fetch() calls must use NEXT_PUBLIC_BASE_PATH themselves.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/waitlist";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
