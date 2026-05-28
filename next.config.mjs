/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    },
    serverComponentsExternalPackages: [
      'read-excel-file',
      'write-excel-file',
      'unzipper',
      'archiver-node'
    ]
  }
};

export default nextConfig;
