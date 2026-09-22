import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection (Next.js 16 "proxy", formerly middleware).
 * Only checks *authentication* cheaply at the edge; *authorization* (roles) is
 * enforced in every route handler / server component via requireCapability().
 */
const PUBLIC = [/^\/signin/, /^\/api\/auth\//, /^\/api\/health$/, /^\/api\/automation\//];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "You must be signed in." } }, { status: 401 });
  }
  const forwardHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const forwardProto = req.headers.get("x-forwarded-proto") || "https";
  const isInternalHost = forwardHost.includes(":8080") || !forwardHost.includes(".");
  const rawBase = (process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim();
  const publicBase = rawBase ? (/^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`) : "";
  const base = (!isInternalHost && forwardHost) ? `${forwardProto}://${forwardHost}` : (publicBase || req.url);

  const url = new URL("/signin", base);
  url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
