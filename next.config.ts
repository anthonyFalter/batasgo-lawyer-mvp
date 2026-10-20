import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdf-parse (pdfjs-dist + @napi-rs/canvas) loads a worker file and native
  // binaries at runtime; bundling breaks those paths on Vercel serverless.
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
