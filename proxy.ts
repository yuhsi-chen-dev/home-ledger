import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sha256, requirePassword } from "./lib/auth.ts";

/**
 * 門鎖（Next 16 的 proxy，舊名 middleware）。
 * cookie 裡的 hash 對得上 sha256(APP_PASSWORD) 就放行，否則踢去 /login。
 * 這裡不知道、也不需要知道登入的是誰（見 docs/02-decisions.md 0002）。
 */
export default async function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value === (await sha256(requirePassword()))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
