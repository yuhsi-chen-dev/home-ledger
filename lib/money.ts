import { other, type PersonId } from "./people.ts";

export const CATEGORIES = ["木工", "水電", "冷氣", "軟裝", "公共分攤", "家電", "雜支"] as const;
export const METHODS = ["轉帳", "信用卡", "現金"] as const;
export const SPLITS = ["half", "verna_only", "miki_only"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Method = (typeof METHODS)[number];
export type Split = (typeof SPLITS)[number];

export const SPLIT_LABEL: Record<Split, string> = {
  half: "各半",
  verna_only: "Verna 全付",
  miki_only: "Miki 全付",
};

/** 算帳只需要這幾個欄位；不要為了算錢把整列 expense 傳進來以外的東西加進這裡。 */
export type Shareable = {
  amount: number;
  split: Split;
  payer: PersonId;
  paid: boolean;
  settled: boolean;
};

/**
 * 某人在這筆裡「應該負擔」多少元（不是「付了」多少）。
 * 一律整數元：各半而金額為奇數時，多出來的 1 元歸付款人。
 */
export function share(row: Pick<Shareable, "amount" | "split" | "payer">, person: PersonId): number {
  if (row.split === "half") {
    const half = Math.floor(row.amount / 2);
    return person === row.payer ? row.amount - half : half;
  }
  return row.split === `${person}_only` ? row.amount : 0;
}

/**
 * 總覽。balance 是「Miki 欠 Verna」的淨額，負數代表反向。
 * 只有「已付給廠商、但還沒互相結清」的那些筆才會進 balance——
 * 還沒付出去的錢談不上誰欠誰。
 */
export function summarize(rows: Shareable[]) {
  let total = 0;
  let paid = 0;
  let balance = 0;
  const burden: Record<PersonId, number> = { verna: 0, miki: 0 };

  for (const r of rows) {
    total += r.amount;
    if (r.paid) paid += r.amount;
    burden.verna += share(r, "verna");
    burden.miki += share(r, "miki");
    if (r.paid && !r.settled) {
      const owed = share(r, other(r.payer));
      balance += r.payer === "verna" ? owed : -owed;
    }
  }

  return { total, paid, unpaid: total - paid, burden, balance };
}

/** 這筆是不是「一個人全付又剛好是他自己付錢」——那就沒有欠款可言。 */
export const selfContained = (row: Pick<Shareable, "split" | "payer">) =>
  row.split === `${row.payer}_only`;

export const twd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * 今天（Asia/Taipei）的 YYYY-MM-DD。伺服器在 Vercel 上是 UTC，
 * 台灣時間半夜記帳會被算成前一天，所以固定綁時區。
 * en-CA 的短日期格式剛好就是 YYYY-MM-DD。
 */
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

/** 收銀台磁磚與收據上的類別圖示。跟 CATEGORIES 同一份，改類別記得補這裡。 */
export const CATEGORY_ICON: Record<Category, string> = {
  木工: "🪚",
  水電: "🔧",
  冷氣: "❄️",
  軟裝: "🛋️",
  公共分攤: "🏢",
  家電: "🔌",
  雜支: "🧾",
};
