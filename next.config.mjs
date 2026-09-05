/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  experimental: {
    useTypeScriptCli: false
  }
};

export default nextConfig;
