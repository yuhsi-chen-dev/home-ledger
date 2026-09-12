import { eq } from "drizzle-orm";
import { getDb } from "@/db/index.ts";
import { receipts } from "@/db/schema.ts";

/**
 * 憑證原圖。proxy.ts 的 matcher 已經蓋到這條路徑，沒有門鎖 cookie 的人
 * 會被踢去 /login，拿不到圖——所以這裡不用再驗一次。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
