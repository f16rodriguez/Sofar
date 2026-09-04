// The 429 a Next route returns when a limit holds (lib/ratelimit.ts).
// Separate from the limiter itself so the standalone functions, which have
// no next/server, can share the limiter.

import { NextResponse } from "next/server";
import type { LimitResult } from "./ratelimit";

export function tooMany(result: LimitResult): NextResponse {
  return NextResponse.json(
    { error: "too many requests", retryAfterSeconds: result.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}
