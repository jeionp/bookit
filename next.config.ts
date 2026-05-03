import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.40.26"],
  // firebase-admin uses native Node.js modules (grpc, etc.) that can't be
  // bundled by the RSC bundler — keep them as external requires.
  serverExternalPackages: ["firebase-admin"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
