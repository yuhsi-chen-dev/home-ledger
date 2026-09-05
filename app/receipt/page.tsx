import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/index.ts";
import { expenses, type Expense } from "@/db/schema.ts";
import { CATEGORY_ICON, SPLIT_LABEL, share, summarize, selfContained, twd } from "@/lib/money.ts";
import { PEOPLE, nameOf, other } from "@/lib/people.ts";
import { PrintButton } from "./print-button.tsx";
import { LinkSpinner } from "../ui.tsx";

export const dynamic = "force-dynamic";

/** 同一工程的分期收在一起看；沒填分組就用收款人當一組（CLAUDE.md：一個廠商多期款）。 */
function group(rows: Expense[]) {
  const groups = new Map<string, Expense[]>();
  for (const r of rows) {
    const key = r.projectGroup ?? r.vendor;
    const items = groups.get(key) ?? [];
    items.push(r);
    groups.set(key, items);
  }
  return [...groups];
}

export default async function Receipt() {
  const rows = await getDb().select().from(expenses).orderBy(asc(expenses.date));
  const s = summarize(rows);
  // 已付但還沒互相結清的金額——這張收據真正「還要付」的部分。
  const owing = rows.filter((r) => r.paid && !r.settled && !selfContained(r));
  const stamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-6">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href="/" className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium">
          ← 回收銀台
          <LinkSpinner />
        </Link>
        <PrintButton />
      </div>

      {/* 出紙口：紙從這條縫吐出來。 */}
      <div className="no-print h-2.5 w-full rounded-t-md bg-stone-800" />

      <article className="receipt bg-white px-6 py-8 font-mono text-[13px] leading-relaxed text-stone-900 shadow-xl">
        <header className="text-center">
          <h1 className="text-lg font-bold tracking-[0.3em]">新家帳本</h1>
          <p className="text-[11px] tracking-[0.2em] text-stone-500">HOME LEDGER</p>
          <p className="mt-3 text-[11px] text-stone-500">
            結帳時間 {stamp}
            <br />
            共 {rows.length} 筆　收銀員 Verna &amp; Miki
          </p>
        </header>

        <Rule double />

        {rows.length === 0 ? (
          <p className="py-6 text-center text-stone-400">目前沒有任何消費紀錄。</p>
        ) : (
          group(rows).map(([name, items]) => (
            <section key={name} className="py-2">
              <p className="font-bold">[{name}]</p>
              {items.map((r) => (
                <div key={r.id} className="mt-1">
                  <Line
                    left={`${CATEGORY_ICON[r.category]} ${r.title}`}
                    right={twd(r.amount)}
                    bold
                  />
                  <p className="pl-5 text-[11px] text-stone-500">
                    {r.date}　{nameOf(r.payer)}付・{SPLIT_LABEL[r.split]}　
                    {r.paid ? `已付(${r.method})` : "未付"}
                    {r.paid && !r.settled && !selfContained(r) &&
                      `　${nameOf(other(r.payer))} 未還 ${twd(share(r, other(r.payer)))}`}
                    {r.settled && "　已結清"}
                  </p>
                </div>
              ))}
              {items.length > 1 && (
                <Line
                  left="小計"
                  right={twd(items.reduce((n, r) => n + r.amount, 0))}
                  className="mt-1 text-stone-500"
                />
              )}
            </section>
          ))
        )}

        <Rule />

        <Line left={`品項合計（${rows.length}）`} right={twd(s.total)} bold />
        <Line left="已付" right={twd(s.paid)} className="text-stone-500" />
        <Line left="未付" right={twd(s.unpaid)} className="text-stone-500" />

        <Rule />

        <p className="text-[11px] tracking-[0.2em] text-stone-500">SPLIT 分帳</p>
        {PEOPLE.map((p) => (
          <Line key={p.id} left={`${p.name} 應負擔`} right={twd(s.burden[p.id])} />
        ))}
        <Line
          left={`待還款（${owing.length} 筆）`}
          right={twd(owing.reduce((n, r) => n + share(r, other(r.payer)), 0))}
          className="text-stone-500"
        />

        <Rule double />

        <p className="py-2 text-center text-base font-bold">
          {s.balance === 0
            ? "✓ 兩人已結清"
            : s.balance > 0
              ? `Miki 要還 Verna ${twd(s.balance)}`
              : `Verna 要還 Miki ${twd(-s.balance)}`}
        </p>

        <Rule double />

        <footer className="pt-3 text-center">
          <p className="text-[11px] tracking-[0.2em] text-stone-500">*** 謝謝惠顧 ***</p>
          <p className="mt-1 text-[11px] text-stone-400">金額為 TWD 整數元，各半而有奇數元時由付款人吸收 1 元。</p>
          <div className="barcode mx-auto mt-4 w-4/5" aria-hidden />
        </footer>
      </article>
    </main>
  );
}

/** 品名 …… 金額，中間用點點引導線串起來。 */
function Line({
  left,
  right,
  bold,
  className = "",
}: {
  left: string;
  right: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <span className={bold ? "font-bold" : ""}>{left}</span>
      <span className="leader" />
      <span className={`shrink-0 tabular-nums ${bold ? "font-bold" : ""}`}>{right}</span>
    </div>
  );
}

function Rule({ double }: { double?: boolean }) {
  return (
    <hr
      className={`my-3 border-0 border-t border-stone-400 ${double ? "border-double border-t-[3px]" : "border-dashed"}`}
    />
  );
}
