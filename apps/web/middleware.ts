import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Per-request CSP: scripts run only with this response's nonce ('strict-dynamic'
 * lets Next's own chunks load). Styles keep 'unsafe-inline' because React and
 * Tailwind emit style attributes; style injection cannot run script.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Cheap pre-check: send visitors without a session cookie to the login page.
  // The API still authenticates every request; this only avoids rendering protected shells.
  if ((pathname.startsWith("/app") || pathname.startsWith("/admin")) && !req.cookies.get("bcp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Everything except static assets and API calls (the API sets its own headers).
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico|fonts/).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
