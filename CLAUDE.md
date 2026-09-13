# CLAUDE.md — home-ledger

個人記帳 web app，底下用**專案**分組管理不同目的的帳。
「築巢收據」（新家裝潢／入住的支出與分帳）是其中一個專案，不是整個 app。

> **正在改建中。** 這份文件描述的是**目標**架構，不是每一行都已經實作完成。
> 目前進度看 `docs/02-architecture.md` 的「實作進度」表。
> 架構全景（分層、資料表關聯、登入與邀請流程）也在那一份。

## 事實（不要重新發明）

- 幣別一律 TWD，整數元，不做小數與匯率。
- **一個專案有自己的分攤人頭（member），名稱自由輸入。** 同一個真人在 A 專案
  叫 Mike、在 B 專案叫「室友」，是兩列不同的 member。人頭**不一定對應到帳號**
  ——只打名字的純人頭照樣能被分攤。
- 分帳規則是**選參與者＋均分**：每筆勾「這筆誰要分」，勾到的人均分，
  餘數歸付款人。只勾一個人＝他全付。
- 「付款」與「分帳」是兩件事，一定分開存：
  - 誰掏的錢（`payer_id`）→ 決定「這筆帳有沒有付出去」
  - 誰欠誰多少（`participants` / `settled_by`）→ 決定「其他人還錢了沒」
  一筆支出可以是「已付廠商、但另一個人還沒還他那份」。
- **`settled_by` 是陣列不是 boolean**，因為三人以上時「A 還了、B 沒還」
  必須分別記。兩人時它只會是 `{}` 或 `{對方}`。
- 一筆記錄的**性質**（`nature`）有三種：`spend` 花掉、`save` 存現金、
  `invest` 投資。**同一張表、同一個表單**，只差這一欄。存錢和買股票不是支出，
  總覽要分成「花掉 X、留下 Y」。買股票**只記金額**，不記股數成本、不算損益。
- 支出來源不只廠商，也包含**鄰居／管委會的公共分攤**（如保護工程），
  這種項目沒有合約、只有一句 LINE 通知＋一個匯款帳號。
- 一個廠商會有多期款（訂金／二期／尾款）。同一工程要能收合成一組看，
  所以每筆支出要有 `vendor` 與可選的 `group_label`（舊名 `project_group`，
  有了 `projects` 表之後改名，免得兩個 project 混淆）。

## 鐵則

1. **不把真實金額、匯款帳號、發票、對話截圖 commit 進 repo。** 真實帳務只存在
   Neon；`.env*`、`data/`、收據圖檔已被 .gitignore 排除。
   seed／測試資料用假數字。
2. 金額計算不用浮點數累加做判斷；比對餘額用整數元。
3. 任何「已付／未付」「已還／未還」的狀態，來源必須是使用者手動確認的紀錄，
   不要用推論（例如不要因為到期日過了就自動標記已付）。
4. **不做權限系統、不做角色。** 有多使用者，但授權只有兩個 boolean 比較：
   是不是這個專案的成員、是不是 owner。成員之間**完全平等**，看到同一份資料，
   都能新增與修改。沒有 role enum、沒有 permission 表。詳見下方「登入與人員」。
5. schema 保持扁平可讀：**一筆支出就是一列**，不要為了正規化拆到三張表。
   id 欄位人看不懂的那部分，由 `expenses_readable` 這個 view 補上——
   程式查 `expenses`，人在 Neon 的 SQL editor 查 `expenses_readable`
   （決策 0006）。改 `expenses` 的欄位要記得一起改 view。

## 決策紀錄

`docs/adr/`，**一個檔案一項決策**，索引在 `docs/adr/README.md`。
不要再往單一大檔案疊。

- 新決策＝取下一個編號開新檔案，寫法與必備段落見索引頁的「怎麼加一條」。
- **推翻舊決策時不要改寫或刪掉舊的那一份**，只改它表頭的「狀態」欄指向新的。
  原文留著，以後才看得到當初為什麼那樣選（例如 0002 的共用密碼）。

## 技術棧與部署

Next.js（App Router）+ Postgres + Drizzle + Vercel。部署與 Neon 的操作手冊
參考 `../OW64/docs/deploy.md`；決策與「哪些不照抄」見 `docs/adr/`。

- driver 是 **postgres.js**，不是 `@neondatabase/serverless`（決策 0003）。
  地端 docker 與 Neon 用同一個 driver，只差 `DATABASE_URL`。
- 連 Neon 要用 **`-pooler`** 的連線字串；`prepare: false` 是它的要求，別拿掉。
- 地端開發用 docker 的 Postgres，指令見 README「地端跑起來」。
- `db:migrate` **沒有**掛在 build 上，改完 schema 要自己跑，
  否則線上會報 column 不存在而本機一切正常。

## 登入與人員

**Google 登入，自己寫 OAuth。不要裝 Auth.js／NextAuth／jose**
（理由見 `docs/adr/0005-google-oauth.md`）。`APP_PASSWORD` 與 `lib/people.ts`
已經刪掉，不要復活它們。

- authorization code flow + PKCE，只要 `openid email profile` 這組 scope。
- `id_token` 是自己用 TLS 直連 token endpoint 拿的，**不驗 JWS 簽章**
  （OIDC Core 3.1.3.7 允許），但 `iss` / `aud` / `exp` / `email_verified`
  一定要驗。不打 userinfo endpoint。
- session cookie＝`base64url(payload).base64url(HMAC-SHA256)`，
  payload 只放 `{uid, exp}`。用 Web Crypto，不加依賴。
- cookie 一律 `httpOnly` + `secure` + `sameSite=lax`。
  OAuth 過程那顆短期 cookie 也是 `lax`——回跳是 top-level GET，
  `strict` 會讓它送不出去。
- **使用者認 `google_sub`，不認 email**（email 會變）。

**授權分兩層，不要合併**（Next 16 把 `middleware.ts` 改名成 `proxy.ts`，
不要退回舊名）：

- `proxy.ts` 只做**樂觀檢查**：驗 cookie 的 HMAC 與有效期，**不查資料庫**。
  這是 Next 官方對 proxy 的定位，不是偷懶。
- `lib/dal.ts` 才是真正的授權邊界：`requireUser()` / `requireProject()`。
  **每個 page、每支 server action、每個 route handler 開頭都要呼叫一次**，
  沒有例外——Server Action 不是獨立路由，proxy 的 matcher 蓋不到它。
  `requireProject()` 失敗回 `notFound()` 不回 403（403 等於承認那個專案存在）。

人員是**每個專案自己的** `members`，沒有全域人員常數。設定頁可以新增人頭
（只打名字）、改 `display_name`、產生邀請連結。

**邀請＝幫一個已存在的人頭綁上 Google 帳號**，不是「建立成員」。
連結自己用 LINE 傳，**不寄 email、不接寄信服務**。token 只在 DB 存
`sha256()`，7 天到期、一次性、owner 可撤銷。
**接受一定要 POST**——聊天軟體會預抓連結做預覽，GET 就接受的話 token
在對方點開前就被爬蟲用掉了。

## 唯一來源

`lib/money.ts` 的 `share()`、`summarize()`、`debts()` 是所有金額計算的唯一來源，
任何頁面、action 都不要自己重算一份。改動後 `npm test` 必須仍然通過。

人員的唯一來源是 **`members` 表**（不是常數、不是 `lib/people.ts`——那個檔案
已經刪了）。

授權判斷的唯一來源是 **`lib/dal.ts`**，不要在 page 裡自己寫一份成員檢查。

## Git 流程

**禁止在 `main` 上 commit。** 遠端是 `git@github.com:yuhsi-chen-dev/home-ledger.git`。
任何增刪修改（程式碼、文件、設定都算）一律走這條路：

```
git switch main && git pull        # 先把 main 更新到最新
git switch -c dev-<在做什麼>       # 從最新的 main 開分支
# 在分支上開發、commit、push
git push -u origin dev-<在做什麼>
```

分支命名用 **`dev-<主題>`**（連字號），**不要用 `dev/<主題>`**（斜線）。
已經有一個叫 `dev` 的分支，git 不允許同時存在 `dev` 和 `dev/xxx`
（前者會佔住 `refs/heads/dev` 這個檔名），會直接報
`cannot lock ref: 'refs/heads/dev' exists`。

`main` 只接受從分支合併回來的結果（PR 或 merge），不直接在上面寫東西。
已經改在 main 上但還沒 commit：`git stash` → 切分支 → `git stash pop`。

## 指令

```
npm run dev / build / typecheck / lint
npm test             分帳算式測試
npm run db:generate  改完 db/schema.ts 後產生 migration
npm run db:migrate   套用 migration（沒有掛在 build 上，要自己跑）
```

## 付款憑證

轉帳／刷卡成功的截圖存在 `receipts` 表的 `bytea` 欄位（Neon 裡，不是外部物件
儲存——理由見 `docs/adr/0004-receipts-in-neon.md`）。原圖只能從 `/img/[id]` 拿。
上傳走 server action，**不收 SVG**（同源 SVG 等於讓上傳檔案在自家網域跑 script）。

⚠️ `/img/[id]` **必須自己檢查呼叫者是不是該專案的成員**。它原本的註解寫
「proxy 已經蓋到，不用再驗」——那句話在只有一本帳時成立，多使用者之後就是個
漏洞：A 專案的人猜到 id 就能拿到 B 專案的轉帳截圖。

## 待決事項

- 目前沒有。專案化改建的四個階段見 `docs/02-architecture.md` 的進度表。

## 回覆慣例

- 對使用者用繁體中文。程式碼識別字用英文，註解可中文。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
