/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transcripts and audio must never reach logs (SPEC §7). Server code uses
  // lib/log.ts redaction; nothing here may enable request body logging.
  reactStrictMode: true,
  // Sent on every response (SPEC §7). Deliberately not a full CSP yet: an
  // over-tight one that breaks the recorder is worse than none, and the
  // headers below are the ones that pay for themselves without that risk.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A private book has no reason to be inside anyone else's page, and
          // a framed page is how a click gets stolen.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Never let a path — a magic-link callback most of all — leave in a
          // Referer header to somewhere else.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The microphone is the one capability this app needs; nothing here
          // needs a camera, a location, or a payment handler.
          {
            key: "Permissions-Policy",
            value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
      {
        // The person's own recordings and their book, never in a cache that
        // is not theirs.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  // Files read from disk at runtime inside the server function. Prompts are
  // loaded by lib/llm.ts on every LLM call; without tracing them in, the
  // deployed function has no such files.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
