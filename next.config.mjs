/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transcripts and audio must never reach logs (SPEC §7). Server code uses
  // lib/log.ts redaction; nothing here may enable request body logging.
  reactStrictMode: true,
  // Files read from disk at runtime inside the server function. Prompts are
  // loaded by lib/llm.ts on every LLM call; without tracing them in, the
  // deployed function has no such files.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
