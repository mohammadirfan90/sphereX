/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'irsa.ipac.caltech.edu',
      },
      {
        protocol: 'https',
        hostname: 'aladin.cds.unistra.fr',
      },
      {
        protocol: 'https',
        hostname: 'skyview.gsfc.nasa.gov',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
