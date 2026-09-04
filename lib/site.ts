// The site's own origin, for redirects and the magic-link return address.
//
// Inside Netlify's Next runtime, request.url carries the deploy's internal
// permalink host (<deploy-id>--sofar-book.netlify.app), not the address in
// the person's browser. A redirect built from it lands them on a host where
// their session cookie does not exist — right after signing in. So the origin
// is configuration first, the browser's own Origin header second, and the
// request last.

export function siteOrigin(headers: Headers, requestUrl?: string): string {
  const fixed = process.env.SITE_URL || process.env.URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  const origin = headers.get("origin");
  if (origin) return origin;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) return `${headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}
