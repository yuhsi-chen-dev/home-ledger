import { eq } from "drizzle-orm";
import { getDb } from "@/db/index.ts";
import { receipts } from "@/db/schema.ts";
import { currentUser } from "@/lib/dal.ts";

/**
 * 憑證原圖。proxy.ts 蓋得到這條路徑，但**這裡仍然自己驗一次**：
 * proxy 只看 cookie 簽章，不知道那個 user 還在不在。
 *
 * ⚠️ 階段 2 之後這裡還要再加一層「呼叫者是不是這張圖所屬專案的成員」，
 * 否則 A 專案的人猜到 id 就能拿到 B 專案的轉帳截圖（CLAUDE.md「付款憑證」）。
 *
 * 沒登入回 404 不回 302：這是圖片端點，<img> 收到 redirect 只會壞掉。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await currentUser())) return new Response(null, { status: 404 });
  const [row] = await getDb().select().from(receipts).where(eq(receipts.id, id)).limit(1);
  if (!row) return new Response("找不到這張憑證", { status: 404 });

  return new Response(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.mime,
      // inline：手機上要直接顯示（可雙指縮放），不是跳出下載。
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // id 是 uuid、內容永不改，快取到天荒地老。private：只准使用者自己的瀏覽器存。
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
