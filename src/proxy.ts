import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection (Next.js 16 "proxy", formerly middleware).
 * Only checks *authentication* cheaply at the edge; *authorization* (roles) is
 * enforced in every route handler / server component via requireCapability().
 */
const PUBLIC = [/^\/signin/, /^\/api\/auth\//, /^\/api\/health$/, /^\/api\/automation\//];

const CALLBACK_COOKIES = ["authjs.callback-url", "__Secure-authjs.callback-url"];
const validCallback = (v: string) => v.startsWith("/") || /^https?:\/\/[^/]+/i.test(v);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A callback-url cookie without protocol (e.g. from an APP_URL without https://) makes Auth.js
  // reject every request with "Invalid callback URL" → user bounces back to /signin. Drop it.
  const bad = CALLBACK_COOKIES.filter((n) => {
    const v = req.cookies.get(n)?.value;
    return v !== undefined && !validCallback(decodeURIComponent(v));
  });
  if (bad.length) {
    bad.forEach((n) => req.cookies.delete(n));
    const res = NextResponse.next({ request: { headers: req.headers } });
    bad.forEach((n) => res.cookies.set(n, "", { path: "/", maxAge: 0, secure: n.startsWith("__Secure-") }));
    return res;
  }

  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // Detect HTTPS: check both the request protocol AND the forwarded proto
  // (Azure/Docker/reverse proxies terminate TLS upstream, so req arrives as http)
  const isHttps =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  // NextAuth v5 uses "__Secure-authjs.session-token" for HTTPS, "authjs.session-token" for HTTP
  const hasSecureCookie = req.cookies.has("__Secure-authjs.session-token");
  const secureCookie = isHttps || hasSecureCookie;
  const cookieName = secureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
    cookieName,
    salt: cookieName,
  });
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
