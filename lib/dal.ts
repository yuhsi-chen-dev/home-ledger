import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index.ts";
import { users, type User } from "@/db/schema.ts";
import { SESSION_COOKIE, readSession } from "./auth.ts";

/**
 * 授權的唯一入口（Next 稱為 Data Access Layer）。
 *
 * proxy.ts 只做樂觀檢查——它跑在每個請求前面（含 prefetch），不能查資料庫，
 * 而且 **Server Action 不是獨立路由，proxy 的 matcher 蓋不到它**
 * （見 node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 * 的 Execution order）。所以真正的授權邊界在這裡，每個 page、每支 action、
 * 每個 route handler 開頭都要呼叫一次。
 */

/** cache()：同一次 render 裡被呼叫幾次都只查一次 DB。 */
export const currentUser = cache(async (): Promise<User | null> => {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, session.uid)).limit(1);
  // 簽章有效但人不在了（被刪掉）——當成沒登入。
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
