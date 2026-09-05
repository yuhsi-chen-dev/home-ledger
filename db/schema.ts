import { pgTable, text, integer, boolean, date, timestamp, index } from "drizzle-orm/pg-core";
import { CATEGORIES, METHODS, SPLITS } from "../lib/money.ts";
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
    category: text("category", { enum: CATEGORIES }).notNull(),
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
