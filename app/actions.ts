"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/index.ts";
import { expenses } from "@/db/schema.ts";
import { CUSTOM_CATEGORY, CUSTOM_ICONS, METHODS, SPLITS, today } from "@/lib/money.ts";
import { PERSON_IDS } from "@/lib/people.ts";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式須為 YYYY-MM-DD");
const id = z.string().min(1).max(64);
// 空字串是「沒填」，一律轉成 null，不要讓空字串進資料庫。
const optionalText = z.string().trim().max(200).transform((v) => v || null);
const optionalDate = z.union([ymd, z.literal("")]).transform((v) => v || null);
const optionalMethod = z.union([z.enum(METHODS), z.literal("")]).transform((v) => v || null);

const Input = z.object({
  date: ymd,
  title: z.string().trim().min(1, "請填項目名稱").max(100),
  amount: z.coerce.number().int("金額須為整數元").positive("金額須大於 0").max(100_000_000),
  // 內建類別或臨時自訂的名字都存在同一欄，所以這裡是自由文字。
  category: z.string().trim().min(1).max(20),
  vendor: z.string().trim().min(1, "請填收款人").max(100),
  projectGroup: optionalText,
  dueDate: optionalDate,
  payer: z.enum(PERSON_IDS),
  split: z.enum(SPLITS),
  method: optionalMethod,
  note: optionalText,
});

// 表單上「＋ 自訂」的兩個附加欄位，不是資料庫欄位，所以跟 Input 分開。
const Custom = z.object({
  customCategory: z.string().trim().max(20).default(""),
  customIcon: z.string().trim().max(8).default(""),
});

/**
 * 「＋ 自訂」是一次性的：名字直接存進 category，選到的 emoji 存進 categoryIcon，
 * 不會被加進 lib/money.ts 的 CATEGORIES，下次打單磁磚上也不會多一塊。
 */
function resolveCategory(category: string, raw: Record<string, unknown>) {
  if (category !== CUSTOM_CATEGORY) return { category, categoryIcon: null };
  const { customCategory, customIcon } = Custom.parse(raw);
  if (!customCategory) redirect("/?error=" + encodeURIComponent("自訂類別要填名稱"));
  return { category: customCategory, categoryIcon: customIcon || CUSTOM_ICONS[0] };
}

export async function addExpense(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = Input.safeParse(raw);
  if (!parsed.success) redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  const v = parsed.data;

  // 選了付款方式就代表已經付掉了；付款日先當成費用日期，不同天的話事後改。
  const paid = v.method !== null;

  // settled 一律 false，包含「自己全付自己的錢」——那種筆的欠款額本來就是 0
  // （lib/money.ts 的 share() 算出來是 0），不需要再存一個 true 去表示同一件事。
  await getDb().insert(expenses).values({
    ...v,
    ...resolveCategory(v.category, raw),
    id: crypto.randomUUID(),
    paid,
    paidDate: paid ? v.date : null,
    settled: false,
    settledDate: null,
  });
  revalidatePath("/");
  redirect(paid ? "/?tab=paid" : "/");
}

/**
 * 修改一筆的內容。刻意不碰 paid／settled——那兩個狀態有自己的按鈕，
 * 而且必須是使用者手動確認的（CLAUDE.md 鐵則 3）。
 */
const Update = Input.extend({
  id,
  // 未付的卡片不顯示這兩欄，formData 裡就沒有；預設空字串＝維持 null。
  method: z.union([z.enum(METHODS), z.literal("")]).default("").transform((v) => v || null),
  paidDate: z.union([ymd, z.literal("")]).default("").transform((v) => v || null),
});

export async function updateExpense(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = Update.safeParse(raw);
  if (!parsed.success) redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  const { id: rowId, ...values } = parsed.data;

  await getDb()
    .update(expenses)
    .set({ ...values, ...resolveCategory(values.category, raw) })
    .where(eq(expenses.id, rowId));
  revalidatePath("/");
  // 表單開關記在網址上，導回沒有 ?edit 的網址就等於收起來。
  redirect(formData.get("tab") === "paid" ? "/?tab=paid" : "/");
}

export async function markPaid(formData: FormData) {
  // 付款日期由使用者挑——昨天付的、今天才標記是常態，不要硬塞今天。
  const values = z
    .object({ id, method: z.enum(METHODS), paidDate: ymd.default(today()) })
    .safeParse(Object.fromEntries(formData));
  if (!values.success) redirect("/?error=請選付款方式與付款日期");
  await getDb()
    .update(expenses)
    .set({ paid: true, paidDate: values.data.paidDate, method: values.data.method })
    .where(eq(expenses.id, values.data.id));
  revalidatePath("/");
}

export async function unmarkPaid(formData: FormData) {
  // settled 也要一起清掉。沒付出去的錢談不上「兩人已結清」，留著會變成
  // 「未付但已結清」的矛盾狀態，之後重新標記已付時會假裝對方還過錢。
  await getDb()
    .update(expenses)
    .set({ paid: false, paidDate: null, method: null, settled: false, settledDate: null })
    .where(eq(expenses.id, id.parse(formData.get("id"))));
  revalidatePath("/");
}

export async function setSettled(formData: FormData) {
  const settled = formData.get("settled") === "1";
  await getDb()
    .update(expenses)
    .set({ settled, settledDate: settled ? today() : null })
    .where(eq(expenses.id, id.parse(formData.get("id"))));
  revalidatePath("/");
}

export async function deleteExpense(formData: FormData) {
  await getDb().delete(expenses).where(eq(expenses.id, id.parse(formData.get("id"))));
  revalidatePath("/");
}
