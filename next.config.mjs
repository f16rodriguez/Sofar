/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transcripts and audio must never reach logs (SPEC §7). Server code uses
  // lib/log.ts redaction; nothing here may enable request body logging.
  reactStrictMode: true,
  // Files read from disk at runtime inside serverless functions. Prompts are
  // loaded by lib/llm.ts on every LLM call; the fonts are embedded in the PDF
  // export. Without tracing them in, the deployed function has no such files.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
    "/api/export": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
