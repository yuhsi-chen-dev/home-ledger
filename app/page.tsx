import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/index.ts";
import { expenses, type Expense } from "@/db/schema.ts";
import {
  CATEGORIES,
  CATEGORY_ICON,
  CUSTOM_CATEGORY,
  CUSTOM_ICONS,
  iconOf,
  METHODS,
  SPLITS,
  SPLIT_LABEL,
  share,
  summarize,
  selfContained,
  twd,
  today,
} from "@/lib/money.ts";
import { PEOPLE, nameOf, other } from "@/lib/people.ts";
import { addExpense, updateExpense, markPaid, unmarkPaid, setSettled, deleteExpense } from "./actions.ts";
import { logout } from "./login/actions.ts";
import { LinkSpinner, SubmitButton } from "./ui.tsx";

// 每次都讀資料庫；build 時不要預先算這頁（那時沒有 DATABASE_URL）。
export const dynamic = "force-dynamic";

/** 待付清單依到期日排，沒填到期日的排最後——有期限的才需要先看。 */
const byDue = (a: Expense, b: Expense) =>
  (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string; new?: string; edit?: string }>;
}) {
  const { error, tab, new: adding, edit } = await searchParams;
  // 待付是預設分頁——會需要動作的都在那裡。已付只是查帳用。
  const showPaid = tab === "paid";
  /**
   * 打單面板與編輯表單的開關記在網址上（?new=1、?edit=<id>），不用 client state：
   * 送出後 action 導回沒有這些參數的網址，表單就自己收起來了。
   */
  const base = showPaid ? "/?tab=paid" : "/";
  const withParam = (k: string, v: string) => `${base}${showPaid ? "&" : "?"}${k}=${v}`;
  const rows = await getDb().select().from(expenses).orderBy(desc(expenses.date));
  const s = summarize(rows);
  const unpaid = rows.filter((r) => !r.paid).sort(byDue);
  const paid = rows.filter((r) => r.paid);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 pb-28 sm:p-6 sm:pb-28 lg:max-w-6xl lg:pb-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🏠 新家帳本</h1>
          <p className="text-xs text-stone-500">裝潢到入住，一單一單打進來。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 shadow-sm">
            {rows.length} 筆
          </span>
          <form action={logout}>
            <SubmitButton className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 shadow-sm transition active:scale-95">
              ⏻ 關機
            </SubmitButton>
          </form>
        </div>
      </header>

      {/* lg 以上：左邊固定收銀機，右邊捲單據；lg 以下維持一條直的。 */}
      <div className="grid items-start gap-5 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* 收銀機顯示幕 */}
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-[0.2em] text-stone-400">TOTAL TWD</span>
              <span className="text-xs text-stone-400">{today()}</span>
            </div>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums">{twd(s.total)}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Readout label="已付" value={twd(s.paid)} />
              <Readout label="未付" value={twd(s.unpaid)} tone="amber" />
            </div>
            <p className="mt-4 border-t border-dashed border-stone-200 pt-3 text-center text-sm font-medium">
              {s.balance === 0
                ? "兩人目前已結清 ✓"
                : s.balance > 0
                  ? `Miki 要還 Verna ${twd(s.balance)}`
                  : `Verna 要還 Miki ${twd(-s.balance)}`}
            </p>
            <p className="mt-1 text-center text-xs text-stone-500">
              應負擔累計　{PEOPLE.map((p) => `${p.name} ${twd(s.burden[p.id])}`).join("　")}
            </p>
          </section>

          {/* 打單機：金額顯示幕 → 類別磁磚 → 誰付／怎麼分 → 送出 */}
          {adding === "1" ? (
            <section className="@container overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="flex items-center justify-between p-4 font-semibold">
                <span>🧮 打一筆新單</span>
                <Link href={base} className="-mr-2 px-2 text-stone-400" aria-label="關閉">
                  ✕
                </Link>
              </div>
            <form action={addExpense} className="flex flex-col gap-5 border-t border-stone-100 p-4">
              <ExpenseFields />

              <Group label="付款方式">
                <div className="grid grid-cols-4 gap-2">
                  <Tile name="method" value="" defaultChecked>
                    還沒付
                  </Tile>
                  {METHODS.map((m) => (
                    <Tile key={m} name="method" value={m}>
                      {m}
                    </Tile>
                  ))}
                </div>
              </Group>

              <Field label="備註（選填）">
                <input name="note" className={input} />
              </Field>

              <SubmitButton
                className="w-full rounded-xl bg-[#5f8a76] px-3 py-3 font-semibold text-white shadow-sm transition hover:bg-[#537a68] active:scale-[0.99]"
              >
                送出打單
              </SubmitButton>
            </form>
            </section>
          ) : (
            <Link
              href={withParam("new", "1")}
              className="flex items-center justify-between rounded-2xl bg-white p-4 font-semibold shadow-sm transition active:scale-[0.99]"
            >
              <span>
                🧮 打一筆新單
                <LinkSpinner />
              </span>
              <span className="text-stone-400">＋</span>
            </Link>
          )}

          {/* 結帳鈕：手機釘在底部，桌機收進左欄跟著收銀機一起停在畫面上。 */}
          <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <Link
              href="/receipt"
              className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl bg-stone-800 px-4 py-3 font-semibold text-white transition active:scale-[0.99] lg:max-w-none"
            >
              <span>
                🧾 結帳・看明細
                <LinkSpinner />
              </span>
              <span className="font-mono tabular-nums">{twd(s.total)}</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* 單據夾：一次只看一疊，待付跟已付不混在一起。 */}
          <div className="no-print flex gap-2">
            <TabLink href="/" active={!showPaid} tone="amber" label="待付" count={unpaid.length} />
            <TabLink href="/?tab=paid" active={showPaid} tone="emerald" label="已付" count={paid.length} />
          </div>

          <List
            rows={showPaid ? paid : unpaid}
            empty={showPaid ? "還沒有已付款項。" : "沒有待付款項 🎉"}
            editId={edit}
            base={base}
            tab={showPaid ? "paid" : ""}
            editHref={(id) => `${withParam("edit", id)}#e-${id}`}
          />
        </div>
      </div>
    </main>
  );
}

const input =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 outline-none focus:border-stone-400 focus:bg-white";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`text-sm text-stone-600 ${wide ? "@md:col-span-2" : ""}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm text-stone-600">{label}</p>
      {children}
    </div>
  );
}

/**
 * 點餐磁磚：radio 藏起來，選中的外觀交給 CSS 的 :has()——
 * ponytail: 不需要 client component，整頁維持 server render。
 */
function Tile({
  name,
  value,
  defaultChecked,
  stacked,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer select-none items-center justify-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-center text-sm transition has-[:checked]:border-stone-800 has-[:checked]:bg-stone-800 has-[:checked]:text-white ${
        stacked ? "flex-col text-xs" : ""
      }`}
    >
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      {children}
    </label>
  );
}

/** 新增與編輯共用同一組欄位；傳 r 就是編輯，帶入原本的值。 */
function ExpenseFields({ r }: { r?: Expense }) {
  return (
    <>
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <label className="block text-right">
          <span className="text-xs tracking-[0.2em] text-stone-400">AMOUNT</span>
          <span className="mt-1 flex items-baseline justify-end gap-2">
            <span className="font-mono text-2xl text-stone-400">$</span>
            <input
              type="number"
              name="amount"
              min="1"
              step="1"
              required
              autoComplete="off"
              inputMode="numeric"
              placeholder="0"
                  defaultValue={r?.amount}
              className="w-full bg-transparent text-right font-mono text-4xl font-bold tabular-nums outline-none placeholder:text-stone-300"
            />
          </span>
        </label>
      </div>

      <Group label="點什麼">
        <div className="group/cat">
          <div className="grid grid-cols-4 gap-2">
            {/* 編輯一筆用過的自訂類別時，把它也排成一塊磁磚，才不用重打一次。 */}
            {r && !CATEGORIES.includes(r.category as (typeof CATEGORIES)[number]) && (
              <Tile name="category" value={r.category} defaultChecked stacked>
                <span className="text-xl">{iconOf(r)}</span>
                {r.category}
              </Tile>
            )}
            {CATEGORIES.map((c, i) => (
              <Tile key={c} name="category" value={c} defaultChecked={r ? r.category === c : i === 0} stacked>
                <span className="text-xl">{CATEGORY_ICON[c]}</span>
                {c}
              </Tile>
            ))}
            <label className="flex cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 px-2 py-2 text-center text-xs text-stone-500 transition has-[:checked]:border-solid has-[:checked]:border-stone-800 has-[:checked]:bg-stone-800 has-[:checked]:text-white">
              <input type="radio" name="category" value={CUSTOM_CATEGORY} data-custom="" className="sr-only" />
              <span className="text-xl">＋</span>
              自訂
            </label>
          </div>

          {/* 選了「＋ 自訂」才展開；純 CSS，沒有 client state。 */}
          <div className="mt-3 hidden flex-col gap-2 group-has-[[data-custom]:checked]/cat:flex">
            <input
              name="customCategory"
              maxLength={20}
              placeholder="類別名稱，例如：油漆"
              className={input}
            />
            <div className="grid grid-cols-8 gap-2">
              {CUSTOM_ICONS.map((e, i) => (
                <Tile key={e} name="customIcon" value={e} defaultChecked={i === 0}>
                  <span className="text-lg">{e}</span>
                </Tile>
              ))}
            </div>
            <p className="text-xs text-stone-400">只用在這一筆，不會加進上面的磁磚。</p>
          </div>
        </div>
      </Group>

      <div className="grid gap-3 @md:grid-cols-2">
        <Field label="項目" wide>
          <input name="title" required defaultValue={r?.title} placeholder="木工二期款" className={input} />
        </Field>
        <Field label="收款人">
          <input name="vendor" required defaultValue={r?.vendor} placeholder="陳師傅 / 管委會" className={input} />
        </Field>
        <Field label="工程分組（選填）">
          <input name="projectGroup" defaultValue={r?.projectGroup ?? ""} placeholder="木工-主臥櫃體" className={input} />
        </Field>
        <Field label="日期">
          <input type="date" name="date" defaultValue={r?.date ?? today()} required className={input} />
        </Field>
        <Field label="付款期限（選填）">
          <input type="date" name="dueDate" defaultValue={r?.dueDate ?? ""} className={input} />
        </Field>
      </div>

      <Group label="誰付的">
        <div className="grid grid-cols-2 gap-2">
          {PEOPLE.map((p, i) => (
            <Tile key={p.id} name="payer" value={p.id} defaultChecked={r ? r.payer === p.id : i === 0}>
              {p.name}
            </Tile>
          ))}
        </div>
      </Group>

      <Group label="怎麼分">
        <div className="grid grid-cols-3 gap-2">
          {SPLITS.map((v, i) => (
            <Tile key={v} name="split" value={v} defaultChecked={r ? r.split === v : i === 0}>
              {SPLIT_LABEL[v]}
            </Tile>
          ))}
        </div>
      </Group>
    </>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl bg-stone-100 px-3 py-2">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`font-mono tabular-nums ${tone === "amber" ? "text-amber-700" : "text-emerald-700"}`}>
        {value}
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone: "amber" | "emerald";
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
        active ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-500"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${tone === "amber" ? "bg-amber-400" : "bg-emerald-400"}`} />
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
      <LinkSpinner />
    </Link>
  );
}

type RowLinks = { editId?: string; base: string; tab: string; editHref: (id: string) => string };

function List({ rows, empty, ...links }: { rows: Expense[]; empty: string } & RowLinks) {
  return (
    <section className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-400">
          {empty}
        </p>
      ) : (
        rows.map((r) => <Row key={r.id} r={r} {...links} />)
      )}
    </section>
  );
}

function Row({ r, editId, base, tab, editHref }: { r: Expense } & RowLinks) {
  const owedBy = other(r.payer);
  const owed = share(r, owedBy);
  const editing = editId === r.id;

  return (
    <article id={`e-${r.id}`} className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-lg">
          {iconOf(r)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.title}</p>
          <p className="truncate text-sm text-stone-500">
            {r.vendor}
            {r.projectGroup && `　${r.projectGroup}`}
          </p>
        </div>
        <p className="shrink-0 font-mono font-semibold tabular-nums">{twd(r.amount)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Pill>{r.date}</Pill>
        <Pill>
          {nameOf(r.payer)}付・{SPLIT_LABEL[r.split]}
        </Pill>
        {!r.paid && r.dueDate && <Pill tone="amber">期限 {r.dueDate}</Pill>}
        {r.paid && (
          <Pill tone="emerald">
            已付 {r.method}・{r.paidDate}
          </Pill>
        )}
        {r.paid && r.settled && <Pill tone="emerald">已結清</Pill>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {!r.paid ? (
          <form action={markPaid} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <select name="method" className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1">
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {/* 付款日期可以往前挑——昨天付的、今天才來標記是常態。 */}
            <input
              type="date"
              name="paidDate"
              defaultValue={today()}
              max={today()}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1"
            />
            <SubmitButton
              className="rounded-lg bg-stone-800 px-3 py-1 font-medium text-white transition active:scale-95"
            >
              標記已付
            </SubmitButton>
          </form>
        ) : (
          <>
            <form action={unmarkPaid}>
              <input type="hidden" name="id" value={r.id} />
              <SubmitButton className="rounded-lg border border-stone-200 px-3 py-1 text-stone-500">
                取消已付
              </SubmitButton>
            </form>
            {!selfContained(r) && (
              <form action={setSettled}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="settled" value={r.settled ? "0" : "1"} />
                <SubmitButton
                  className={
                    r.settled
                      ? "rounded-lg bg-emerald-50 px-3 py-1 text-emerald-700"
                      : "rounded-lg border border-stone-200 px-3 py-1 transition active:scale-95"
                  }
                >
                  {r.settled ? `已結清（${r.settledDate}）` : `${nameOf(owedBy)} 還了 ${twd(owed)}`}
                </SubmitButton>
              </form>
            )}
          </>
        )}

      </div>

      {r.note && <p className="mt-2 text-sm text-stone-400">{r.note}</p>}

      <div className="mt-2 text-right">
        <Link
          href={editing ? base : editHref(r.id)}
          className="inline-block rounded-lg border border-stone-200 px-3 py-1 text-sm text-stone-500"
        >
          {editing ? "✕ 取消編輯" : "✏️ 編輯"}
          <LinkSpinner />
        </Link>
      </div>

      {editing && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          {/* ponytail: 沒有編輯頁，直接在卡片裡展開同一組打單欄位。 */}
          <form action={updateExpense} className="@container mt-3 flex flex-col gap-5 border-t border-stone-100 pt-4">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="tab" value={tab} />
            <ExpenseFields r={r} />

            {r.paid && (
              <div className="grid gap-3 @md:grid-cols-2">
                <Field label="付款方式">
                  <select name="method" defaultValue={r.method ?? METHODS[0]} className={input}>
                    {METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="付款日期">
                  <input type="date" name="paidDate" defaultValue={r.paidDate ?? today()} className={input} />
                </Field>
              </div>
            )}

            <Field label="備註（選填）">
              <input name="note" defaultValue={r.note ?? ""} className={input} />
            </Field>

            <div className="flex gap-2">
              <Link
                href={base}
                className="rounded-xl border border-stone-200 px-4 py-3 text-center font-medium text-stone-500"
              >
                取消
                <LinkSpinner />
              </Link>
              <SubmitButton
                className="flex-1 rounded-xl bg-stone-800 px-3 py-3 font-semibold text-white transition active:scale-[0.99]"
              >
                儲存修改
              </SubmitButton>
            </div>
          </form>

          <form action={deleteExpense} className="mt-3 text-right">
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="rounded-lg bg-red-50 px-3 py-1 text-red-700">
              刪除這筆
            </SubmitButton>
          </form>
        </div>
      )}
    </article>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "amber" | "emerald" }) {
  const color =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-stone-100 text-stone-500";
  return <span className={`rounded-full px-2 py-0.5 ${color}`}>{children}</span>;
}
