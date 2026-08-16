/** @type {import('next').NextConfig} */

// Framing policy: the portfolio at dc-taupe.vercel.app embeds this app live,
// so a blanket X-Frame-Options: DENY can't be used — XFO has no way to
// allow-list an origin (ALLOW-FROM is unsupported in every current browser).
// CSP frame-ancestors is the modern equivalent and is strictly more precise:
// every other origin is still refused, exactly as DENY did.
const FRAME_ANCESTORS = [
  "'self'",
  "https://dc-taupe.vercel.app",
  "http://localhost:3000"
].join(" ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}` },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"]
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

export default nextConfig;
