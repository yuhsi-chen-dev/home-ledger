# CLAUDE.md — home-ledger

新家裝潢／入住支出記錄與分帳的 web app。

## 事實（不要重新發明）

- 幣別一律 TWD，整數元，不做小數與匯率。
- 分帳固定兩人：`verna` 與 `miki`。預設一人一半，但**負擔人可逐筆覆寫**
  （有些項目是一方全付，例如個人家具）。
- 「付款」與「分帳」是兩件事，一定分開存：
  - 誰付給廠商（payer）→ 決定「這筆帳有沒有清掉」
  - 誰欠誰多少（settlement）→ 決定「另一個人還錢了沒」
  一筆支出可以是「已付廠商、但另一個人還沒還一半」。
- 支出來源不只廠商，也包含**鄰居／管委會的公共分攤**（如保護工程），
  這種項目沒有合約、只有一句 LINE 通知＋一個匯款帳號。
- 一個廠商會有多期款（訂金／二期／尾款）。同一工程要能收合成一組看，
  所以每筆支出要有 `vendor` 與可選的 `project_group`。

## 鐵則

1. **不把真實金額、匯款帳號、發票、對話截圖 commit 進 repo。** 真實帳務只存在
   Neon；`.env*`、`data/`、收據圖檔已被 .gitignore 排除。
   seed／測試資料用假數字。
2. 金額計算不用浮點數累加做判斷；比對餘額用整數元。
3. 任何「已付／未付」「已還／未還」的狀態，來源必須是使用者手動確認的紀錄，
   不要用推論（例如不要因為到期日過了就自動標記已付）。
4. 這是兩個人共用一本帳的工具。有登入（門鎖），但**不做權限系統、不做角色、
   不做多租戶**——兩人看到的完全是同一份資料。詳見下方「登入與人員」。
5. schema 保持扁平可讀：一筆支出就是一列，欄位名看得懂。使用者要能在 Neon
   的 SQL editor 直接 `select * from expenses` 就看懂自己花了多少錢。
   不要為了正規化把一筆支出拆到三張表。

## 技術棧與部署

Next.js（App Router）+ Postgres + Drizzle + Vercel。部署與 Neon 的操作手冊
參考 `../OW64/docs/deploy.md`；決策與「哪些不照抄」見 `docs/02-decisions.md`。

- driver 是 **postgres.js**，不是 `@neondatabase/serverless`（決策 0003）。
  地端 docker 與 Neon 用同一個 driver，只差 `DATABASE_URL`。
- 連 Neon 要用 **`-pooler`** 的連線字串；`prepare: false` 是它的要求，別拿掉。
- 地端開發用 docker 的 Postgres，指令見 README「地端跑起來」。
- `db:migrate` **沒有**掛在 build 上，改完 schema 要自己跑，
  否則線上會報 column 不存在而本機一切正常。

## 登入與人員

**共用一組密碼，不做帳號。** 不要裝 Auth.js／NextAuth，也不要抄 OW64 的
Google 登入（理由見 `docs/02-decisions.md` 0002）。

- 密碼放環境變數 `APP_PASSWORD`，兩個人自己知道。
- 一個 `/login` 頁面，只有一個密碼欄位。
- 驗證方式：比對 **sha256 hash**，不是明文。cookie 存 hash，
  `proxy.ts` 比對 `sha256(APP_PASSWORD)`。用 Web Crypto，不加任何依賴。
  （Next 16 把 `middleware.ts` 改名成 `proxy.ts`，不要退回舊名。）
- cookie 一律 `httpOnly` + `secure` + `sameSite=lax`。
- **不知道也不需要知道是誰登入的。** 沒有 session user、沒有 `userId`、
  沒有多租戶。兩個人看到完全同一份資料。

人員固定兩人，寫死在一個常數裡，**沒有人員管理頁面**：

```ts
export const PEOPLE = [
  { id: "verna", name: "Verna" },
  { id: "miki",  name: "Miki"  },
] as const;
```

`payer`、分帳歸屬的下拉選單都渲染這個常數。要改名就改這一行。
真的出現第三個要分攤的人（不是廠商、不是鄰居代收）再開新決策。

## 唯一來源

`lib/money.ts` 的 `share()` 與 `summarize()` 是所有金額計算的唯一來源，
任何頁面、action 都不要自己重算一份。改動後 `npm test` 必須仍然通過。

`lib/people.ts` 的 `PEOPLE` 是人員的唯一來源。

## Git 流程

**禁止在 `main` 上 commit。** 遠端是 `git@github.com:yuhsi-chen-dev/home-ledger.git`。
任何增刪修改（程式碼、文件、設定都算）一律走這條路：

```
git switch main && git pull        # 先把 main 更新到最新
git switch -c dev                  # 從最新的 main 開分支（或 dev/<在做什麼>）
# 在分支上開發、commit、push
git push -u origin dev
```

`main` 只接受從分支合併回來的結果（PR 或 merge），不直接在上面寫東西。
已經改在 main 上但還沒 commit：`git stash` → 切分支 → `git stash pop`。

## 指令

```
npm run dev / build / typecheck / lint
npm test             分帳算式測試
npm run db:generate  改完 db/schema.ts 後產生 migration
npm run db:migrate   套用 migration（沒有掛在 build 上，要自己跑）
```

## 待決事項

- 是否要記錄發票／收據照片（會牽涉檔案儲存，先不做）。

## 回覆慣例

- 對使用者用繁體中文。程式碼識別字用英文，註解可中文。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
