import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "./lib/auth.ts";

/**
 * 門鎖（Next 16 的 proxy，舊名 middleware）。
 *
 * 這裡只做**樂觀檢查**：驗 session cookie 的 HMAC 與有效期，不查資料庫。
 * Next 官方對 proxy 的定位就是這樣——"it should not be used as a full session
 * management or authorization solution"（01-app/01-getting-started/16-proxy.md）。
 *
 * 真正的授權在 lib/dal.ts，每個 page／action／route handler 自己呼叫。
 * 不要把成員檢查搬進來：proxy 蓋不到 Server Action。
 */
export default async function proxy(req: NextRequest) {
  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const to = new URL("/login", req.url);
  const from = req.nextUrl.pathname + req.nextUrl.search;
  // 登入完把人送回原本要去的地方；首頁是預設值，不用寫進網址。
  if (from !== "/") to.searchParams.set("next", from);
  return NextResponse.redirect(to);
}

export const config = {
  // auth/   OAuth 的起點與回跳，未登入時本來就要走得通。
  // invite/ 階段 3 的邀請落地頁，未登入也要打得開才看得到自己被邀請進什麼。
  matcher: ["/((?!login|auth/|invite/|icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
