import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "image.tving.com", pathname: "/ntgs/sports/kbo/**" }],
  },
};

export default nextConfig;
