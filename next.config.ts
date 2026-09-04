import type { NextConfig } from "next";
import { NextResponse } from "next/server";

const ContentSecurityPolicy = `
  default-src 'self' ;
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://cdn.paddle.com https://sandbox-cdn.paddle.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  frame-src https://www.google.com https://www.gstatic.com https://buy.paddle.com https://sandbox-buy.paddle.com https://checkout.paddle.com https://sandbox-checkout.paddle.com;
  img-src 'self' data: https:;
  connect-src 'self' https:;
  frame-ancestors 'none';
`;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy.replace(/\n/g, ""),
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Serving Doctor and Review Doctor merged into /tools/diagnostics. These are
  // permanent: the old paths are gone, and people bookmark tools.
  async redirects() {
    return [
      { source: "/tools/serving-health", destination: "/tools/diagnostics", permanent: true },
      { source: "/tools/review-health", destination: "/tools/diagnostics?tab=review", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.pixabay.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

};

export default nextConfig;
