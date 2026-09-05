export const COOKIE = "home-ledger-auth";

/**
 * cookie 存的是密碼的 sha256，不是明文——cookie 洩漏時不會直接洩漏密碼，
 * 而且驗證改成比對兩個等長 hash，時序差異沒有意義。
 * Web Crypto 是全域的，middleware 的 Edge runtime 也有，零依賴。
 */
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function requirePassword(): string {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("APP_PASSWORD 未設定");
  return pw;
}
