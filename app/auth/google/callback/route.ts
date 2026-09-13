import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/index.ts";
import { users } from "@/db/schema.ts";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  env,
  fromB64url,
  signSession,
} from "@/lib/auth.ts";
import { redirectUri } from "../route.ts";

const TOKEN = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

type Claims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  exp: number;
};

const fail = (req: NextRequest, why: string) =>
  NextResponse.redirect(new URL(`/login?error=${why}`, req.url));

/**
 * 階段 1／2 的過渡措施：這時候還沒有 projects 與 members，全站只有一本帳，
 * 任何 Google 帳號登入就會看到裡面的真實金額。所以先用白名單擋住。
 *
 * 階段 2 之後由 members 決定誰看得到哪本帳，這個函式與 ALLOWED_EMAILS
 * 一起刪掉——那時候「誰能登入」本來就不該是門檻，「登入後看得到什麼」才是。
 *
 * 沒設定就一個人都不放行（fail closed）。這是記帳本，寧可登不進去。
 */
function allowed(email: string): boolean {
  return env("ALLOWED_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const returned = req.nextUrl.searchParams.get("state");
  const [state, verifier, next = "/"] = (req.cookies.get(OAUTH_COOKIE)?.value ?? "").split("|");

  // state 不見了、對不上，或根本沒帶 code —— 一律當失敗，不要試著補救。
  if (!code || !state || !verifier || returned !== state) return fail(req, "state");

  const token = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
    }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  if (!token?.id_token) return fail(req, "token");

  /**
   * 不驗 JWS 簽章：這個 id_token 是我們自己用 TLS 直連 token endpoint 拿回來的，
   * OIDC Core 3.1.3.7 步驟 6 明文允許以 TLS server validation 取代驗簽
   * （只有經瀏覽器轉交的 implicit／hybrid 才非驗不可）。
   * 省掉 JWKS 抓取＋快取＋輪替，也就不需要 jose。
   *
   * 但 claims 一定要驗——沒驗 aud 的話，別人的 app 拿到的 token 也能進來。
   */
  let c: Claims;
  try {
    c = JSON.parse(new TextDecoder().decode(fromB64url(token.id_token.split(".")[1])));
  } catch {
    return fail(req, "claims");
  }
  if (
    !ISSUERS.has(c.iss) ||
    c.aud !== env("GOOGLE_CLIENT_ID") ||
    c.exp * 1000 < Date.now() ||
    !c.email_verified ||
    !c.sub ||
    !c.email
  ) {
    return fail(req, "claims");
  }

  const email = c.email.toLowerCase();
  // 先擋再寫：被拒絕的人不要在 users 留下一列。
  if (!allowed(email)) return fail(req, "blocked");

  // 認 google_sub。名字與頭像每次登入都跟著更新，使用者在 Google 改了就會同步。
  const [user] = await getDb()
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      googleSub: c.sub,
      email,
      name: c.name ?? email,
      picture: c.picture ?? null,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email, name: c.name ?? email, picture: c.picture ?? null },
    })
    .returning();

  // insert ... returning 一定會回一列；型別上是陣列，防禦性擋一下。
  if (!user) return fail(req, "token");

  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), SESSION_COOKIE_OPTS);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth/google" });
  return res;
}
