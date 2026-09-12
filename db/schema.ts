import { pgTable, text, integer, boolean, date, timestamp, index, customType } from "drizzle-orm/pg-core";
import { METHODS, SPLITS } from "../lib/money.ts";
import { PERSON_IDS } from "../lib/people.ts";

/**
 * 一筆支出＝一次要付給某人的錢。分期款是「多列」，不是一列。
 * 刻意保持扁平：在 Neon 的 SQL editor 直接 select * 就要看得懂
 * （見 CLAUDE.md 鐵則 5）。沒有 userId——兩人共用一本帳，登入只是門鎖。
 */
export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    // 費用發生／被通知的日期，不是付款日。
    date: date("date").notNull(),
    title: text("title").notNull(),
    // TWD 整數元。不用 numeric／real，金額不需要小數，也不想碰浮點數。
    amount: integer("amount").notNull(),
    // 內建類別（見 lib/money.ts 的 CATEGORIES）或打單時臨時自訂的名字，
    // 所以是自由文字。自訂的那種把選到的 emoji 一起存在下面這欄。
    category: text("category").notNull(),
    categoryIcon: text("category_icon"),
    // 收款人。鄰居／管委會的公共分攤也記在這裡——他們是收款人，不是分帳人。
    vendor: text("vendor").notNull(),
    // 同一工程的分期共用同一值，例如「木工-主臥櫃體」。空＝單筆。
    projectGroup: text("project_group"),
    dueDate: date("due_date"),
    // paid／settled 一律由使用者手動確認，不從 dueDate 推論（CLAUDE.md 鐵則 3）。
    paid: boolean("paid").notNull().default(false),
    paidDate: date("paid_date"),
    method: text("method", { enum: METHODS }),
    // 已付＝誰付的；未付＝預計誰付。
    payer: text("payer", { enum: PERSON_IDS }).notNull(),
    split: text("split", { enum: SPLITS }).notNull().default("half"),
    // 兩人之間結清了沒。跟 paid 是兩件不同的事，不要合併。
    settled: boolean("settled").notNull().default(false),
    settledDate: date("settled_date"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_due_idx").on(t.paid, t.dueDate)],
);

export type Expense = typeof expenses.$inferSelect;

/** postgres.js 的 bytea 兩邊都是 Uint8Array；drizzle 沒有內建這型別。 */
const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

/**
 * 付款憑證：轉帳成功畫面、刷卡完成截圖之類。圖片本體存 Neon 而不是外部
 * 物件儲存——截圖上有帳號末碼，不該有一條繞過門鎖的公開網址
 * （鐵則 1：真實憑證只存 Neon）。
 *
 * 另開一張表而不是在 expenses 加欄位，是為了 `select * from expenses`
 * 還看得懂（鐵則 5）；binary 塞進去會把 SQL editor 洗版。
 *
 * ponytail: 原圖照收不壓縮。Neon free 0.5GB ÷ 手機截圖 ~3MB ≈ 150 張，
 * 裝潢期夠用；真的塞滿再加上傳前的 canvas 壓縮。
 */
export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    // 刪支出就連帶刪圖，不用自己收孤兒資料。
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_expense_idx").on(t.expenseId)],
);

export type Receipt = typeof receipts.$inferSelect;
