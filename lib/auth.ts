/**
 * session 與 OAuth 的加解密工具。全部走 Web Crypto，零依賴
 * （見 docs/adr/0005-google-oauth.md）。
 */

/** 登入後的身分憑證。30 天，不做滑動續期。 */
export const SESSION_COOKIE = "home-ledger-session";

/** OAuth 來回那 10 分鐘暫存 state / PKCE verifier / 回跳目標用的。 */
export const OAUTH_COOKIE = "home-ledger-oauth";

export const SESSION_DAYS = 30;

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 未設定`);
  return v;
}

/**
 * base64url（無 padding）。session、state、PKCE verifier 都用它。
 * ponytail: fromCharCode 展開陣列在幾 MB 的輸入會爆堆疊，
 * 這裡最大是一段 session payload（幾十位元組），撞不到。
 */
export const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

// 明寫 <ArrayBuffer>：TS 5.7 之後 Uint8Array 是泛型，預設的 ArrayBufferLike
// 含 SharedArrayBuffer，Web Crypto 的 BufferSource 不收。
export const fromB64url = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

/** n 個位元組的亂數，轉成 base64url。 */
export const randomToken = (n: number): string => b64url(crypto.getRandomValues(new Uint8Array(n)));

const utf8 = new TextEncoder();

let keyPromise: Promise<CryptoKey> | undefined;
function hmacKey(): Promise<CryptoKey> {
  const secret = env("SESSION_SECRET");
  return (keyPromise ??= crypto.subtle.importKey(
    "raw",
    utf8.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  ));
}

/**
 * cookie 值＝`base64url(payload).base64url(HMAC)`，payload 只有 `{uid, exp}`。
 *
 * 不放 email／名字／專案清單：那些改了就得重新登入，而且 cookie 每個請求都要傳。
 * 不用 JWT 函式庫——JWT 的複雜度幾乎全在跟第三方互通（多演算法協商、JWKS
 * 輪替），而 `alg` 協商正是它最有名的漏洞來源。我們簽的只有自己讀，
 * 單一演算法，沒有協商面就沒有那類漏洞。
 */
export async function signSession(uid: string, days = SESSION_DAYS): Promise<string> {
  const payload = b64url(utf8.encode(JSON.stringify({ uid, exp: Date.now() + days * 86_400_000 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), utf8.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/**
 * 只驗簽章與有效期，**不查資料庫**——proxy 也會呼叫這支，它跑在每個請求前面
 * （包含 prefetch）。「這個 user 還在不在、能看哪些專案」是 lib/dal.ts 的事。
 *
 * subtle.verify 本身就是常數時間比較，不需要自己寫 timingSafeEqual。
 */
export async function readSession(token: string | undefined): Promise<{ uid: string } | null> {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), utf8.encode(payload));
    if (!ok) return null;
    const { uid, exp } = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof uid === "string" && typeof exp === "number" && exp > Date.now() ? { uid } : null;
  } catch {
    // 簽章或 payload 不是合法的 base64url／JSON——偽造的 cookie，當沒登入。
    return null;
  }
}

/** 邀請 token 只在資料庫存 hash（階段 3 會用到）。 */
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", utf8.encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
