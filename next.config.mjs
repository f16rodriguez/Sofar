/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transcripts and audio must never reach logs (SPEC §7). Server code uses
  // lib/log.ts redaction; nothing here may enable request body logging.
  reactStrictMode: true,
};

export default nextConfig;
