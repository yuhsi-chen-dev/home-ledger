"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth.ts";

/**
 * 關機：把 session cookie 刪掉。
 *
 * stateless session 沒有伺服器端撤銷——這裡只是叫瀏覽器把 cookie 丟掉，
 * 那個字串本身在 exp 之前仍然是有效簽章。要讓所有人立刻失效只能換
 * SESSION_SECRET（見 docs/adr/0005-google-oauth.md 的已知天花板）。
 */
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
