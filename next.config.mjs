/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transcripts and audio must never reach logs (SPEC §7). Server code uses
  // lib/log.ts redaction; nothing here may enable request body logging.
  reactStrictMode: true,
  // react-pdf pulls in fontkit, pdfkit and a layout engine. Kept out of the
  // server bundle and loaded from node_modules only when /api/export runs, so
  // every other request does not pay its initialisation on a cold start.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Files read from disk at runtime inside serverless functions. Prompts are
  // loaded by lib/llm.ts on every LLM call; the fonts are embedded in the PDF
  // export. Without tracing them in, the deployed function has no such files.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
    "/api/export": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
