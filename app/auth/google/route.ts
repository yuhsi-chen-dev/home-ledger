import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, b64url, env, randomToken } from "@/lib/auth.ts";

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";

/** Google Console 上登記的那條，必須完全字串相符。 */
export const redirectUri = () => `${env("APP_URL")}/auth/google/callback`;

/**
 * 只收站內相對路徑。`//evil.com` 在瀏覽器眼裡是 protocol-relative 的絕對網址，
 * 不擋掉就是一個 open redirect。
 */
function safeNext(req: NextRequest): string {
  const n = req.nextUrl.searchParams.get("next") ?? "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

/**
 * 登入起點：產 state 與 PKCE，把使用者送去 Google。
 *
 * PKCE 對 confidential client 理論上非必要（我們有 client_secret），
 * 但它同時擋掉「授權碼被注入」，成本是三行。
 */
export async function GET(req: NextRequest) {
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );

  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // 被邀請的人常有多個 Google 帳號，不加這個會直接沿用瀏覽器現有登入。
    prompt: "select_account",
    // 不帶 access_type=offline：我們不需要 refresh token，也就不必保管它。
  }).toString();

  const res = NextResponse.redirect(url);
  // state / verifier / 回跳目標塞同一個 cookie，省兩個 Set-Cookie。
  // sameSite 必須是 lax：OAuth 回跳是 top-level GET，strict 會讓它送不出去。
  res.cookies.set(OAUTH_COOKIE, [state, verifier, safeNext(req)].join("|"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return res;
}
