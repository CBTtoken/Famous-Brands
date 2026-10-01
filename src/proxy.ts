import { NextResponse, type NextRequest } from "next/server";

// Pass the path to server layouts (they cannot read it otherwise), so the
// first-sign-in password screen can be exempt from its own redirect.
export function proxy(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!api|_next|sw.js|manifest.webmanifest|icon|apple-icon|.*\\.png$).*)"] };
