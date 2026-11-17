/** @type {import('next').NextConfig} */
const nextConfig = {
  // mongodb / mysql2 / bcryptjs are server-only
  experimental: { serverComponentsExternalPackages: ['mongodb', 'mysql2'] },
};
export default nextConfig;
