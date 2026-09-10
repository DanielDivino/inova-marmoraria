import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.INOVA_TEST_DIST_DIR === '.next-e2e' ? '.next-e2e' : process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://127.0.0.1:3333'}/:path*` }];
  }
};

export default nextConfig;
