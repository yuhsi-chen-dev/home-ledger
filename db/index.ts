import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.ts";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * 一般 Postgres 連線，本機 docker 與 Neon 都通，只差 DATABASE_URL——
 * 所以不需要為了地端開發多一套 driver 或多一個 proxy。
 *
 * 連 Neon 時用 **-pooler** 的連線字串（pgbouncer），`prepare: false` 是它的要求。
 *
 * ponytail: TCP 連線在 serverless 上不如 Neon 的 HTTP driver 省連線；
 * 兩個人記帳撞不到這個天花板，真的撞到再換回 @neondatabase/serverless。
 *
 * 連線延後到第一次查詢，這樣 build 與 typecheck 不需要 DATABASE_URL。
 */
export function getDb() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 未設定");
    cached = drizzle(postgres(url, { prepare: false }), { schema });
  }
  return cached;
}
