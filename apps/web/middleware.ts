import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap pre-check: send visitors without a session cookie to the login page.
 * The API still authenticates every request; this only avoids rendering
 * protected shells for signed-out users.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("bcp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
