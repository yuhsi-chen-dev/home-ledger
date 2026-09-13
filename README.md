# 築巢收據（home-ledger）

個人記帳 web app，底下用**專案**分組管理不同目的的帳。
每個專案有自己的分攤人頭，可以產生連結邀請別人一起記。

「築巢收據」——新家從裝潢到入住的所有支出與分帳——是其中一個專案。

> **正在從「一本裝潢帳」改建成「專案制記帳 app」。**
> 進度表與架構全景見 `docs/02-architecture.md`。

## 這個 app 要回答的問題

**每一本帳都要回答的**

1. 這本帳總共花了多少錢？花在哪些類別？
2. 這筆付了沒？用什麼付的？（轉帳／信用卡／現金／行動支付）
3. 下一筆該付的是哪一筆、什麼時候到期？
4. 我先付的錢，其他人還我了嗎？（或反之）

**個人記帳額外要回答的**

5. 這個月「花掉」多少、「留下」多少？（存現金 + 投資不是支出）

## 文件

| 檔案 | 內容 |
|---|---|
| `docs/00-pain-points.md` | 當初為什麼要做這個（築巢收據的痛點） |
| `docs/01-data-model.md` | 每一張表的欄位定義與衍生計算 |
| `docs/02-architecture.md` | **架構全景 ASCII 圖**：分層、表關聯、登入流程、邀請流程 |
| `docs/adr/` | 決策紀錄（ADR），一個檔案一項決策。索引在 `docs/adr/README.md` |

## 技術棧

| 項目 | 選擇 |
|---|---|
| 框架 | Next.js 16（App Router；`middleware.ts` 已改名成 `proxy.ts`） |
| 資料庫 | Postgres（地端 docker／線上 Neon）+ Drizzle ORM，driver 是 postgres.js |
| 部署 | Vercel（push `main` 自動部署） |
| 登入 | Google OAuth，**自己寫**，零依賴（決策 0005） |
| 邀請 | 產生連結自己傳 LINE，**不寄 email**（決策 0009） |

與 `../OW64` 同一套基礎建設，部署操作手冊可參考 `../OW64/docs/deploy.md`。
理由與「哪些部分不照抄」見 `docs/adr/`。

## 狀態

- [x] 前置文件、技術選型
- [x] 專案初始化（Next.js + Drizzle + Tailwind）
- [x] 第一版可輸入／可查看的介面
- [x] 部署到 Vercel + Neon
- [x] 付款憑證（轉帳截圖存 Neon）
- [x] 專案化改建的規劃與文件（階段 0）
- [ ] 階段 1：Google 登入、session、DAL
- [ ] 階段 2：專案化、分帳 N 人化、資料遷移
- [ ] 階段 3：邀請連結、專案設定頁
- [ ] 階段 4：個人記帳 UX（性質、類別、多元支付、總覽）

## 開發

```
npm run dev          開發伺服器
npm run build        production build（含型別檢查）
npm run typecheck    tsc --noEmit
npm run lint         ESLint
npm test             分帳算式的測試（lib/money.test.ts）
npm run db:generate  改完 db/schema.ts 後產生 migration
npm run db:migrate   套用 migration
```

### 環境變數

複製 `.env.example` 成 `.env.local` 並填入：

| 變數 | 說明 | 沒設會怎樣 |
|---|---|---|
| `DATABASE_URL` | 地端指 docker、線上指 Neon 的 `-pooler` 連線字串 | 任何讀資料的頁面 500 |
| `GOOGLE_CLIENT_ID` | OAuth client 識別 | 登入頁按下去就爆 |
| `GOOGLE_CLIENT_SECRET` | 換 token 時認證 client | callback 換不到 token |
| `SESSION_SECRET` | HMAC 簽 session，`openssl rand -base64 32` | 所有頁面 500 |
| `APP_URL` | OAuth `redirect_uri` 與邀請連結的絕對網址 | redirect_uri 對不上，Google 擋掉 |

`SESSION_SECRET` **地端與線上各一把，不要共用**。換掉它等於把所有人登出。

### Google Cloud Console 設定

建一個 OAuth 2.0 Client ID，型別選 **Web application**。

Authorized redirect URIs（**必須完全字串相符**，含 scheme 與有無結尾斜線）：

```
http://localhost:3000/auth/google/callback
https://<正式網域>/auth/google/callback
```

Authorized JavaScript origins 留空（我們不用 Google 的前端 JS）。

**兩個會浪費你半小時的坑：**

1. **consent screen 一定要 Publish 成 In production。** 留在 Testing 模式時
   只有 test users 名單內的 email 能登入——被你邀請的人會直接被 Google 擋掉，
   而且錯誤訊息不會告訴你是這個原因。我們只用 non-sensitive scope，
   publish 不需要 Google 審核。
2. **Vercel preview 網址每次部署都不同**，沒辦法事先列進 redirect URI。
   所以 preview 環境登入不了——要嘛接受，要嘛掛一條固定的 branch alias
   再把它加進清單。

### 地端跑起來

不需要 Neon，docker 的 Postgres 就夠：

```
docker run -d --name hl-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=home_ledger \
  -p 55432:5432 -v hl-pgdata:/var/lib/postgresql/data postgres:17

cp .env.example .env.local   # 填 Google OAuth 與 SESSION_SECRET
npm run db:migrate           # 建表
npm run dev
```

之後只要 `docker start hl-pg`；資料在 `hl-pgdata` 這個 volume 裡，
`docker rm` 容器不會弄丟。

> 容器**剛建好**的那一次 `db:migrate` 可能報錯——Postgres 初始化時會重啟一次，
> `pg_isready` 會早一步說就緒。再跑一次就好。

### 部署

Vercel 接 `main`，push 就部署。環境變數要在 Vercel 設好；
`DATABASE_URL` 在 Preview 環境要指向 Neon 的 `dev` branch，
不要讓預覽站寫到正式資料。

**`db:migrate` 沒有掛在 build 上。** 改完 schema 要自己跑，否則 Vercel 會部署
成功、線上卻報 column 不存在，而本機一切正常。細節見 `../OW64/docs/deploy.md`。

**有 migration 的那一次，順序是「先跑 migration，再部署新 code」。**

## 檔案

```
app/page.tsx            專案列表
app/p/[id]/             單一專案：帳本、結帳明細、設定（成員與邀請）
app/actions.ts          新增、標記已付、標記已還、刪除、上傳憑證（server actions）
app/auth/google/        Google OAuth 起點與 callback
app/invite/[token]/     邀請落地頁與接受
app/login/              一顆 Google 登入按鈕
app/img/[id]/           付款憑證原圖（要自己檢查專案成員身分）
proxy.ts                門鎖：只驗 session cookie 的簽章，不查 DB
lib/dal.ts              授權唯一入口：requireUser / requireProject
lib/auth.ts             session 簽／驗、sha256（給邀請 token 用）
lib/money.ts            分帳算式（唯一來源）+ 類別／付款方式／性質的列舉
lib/money.test.ts       分帳算式的測試
db/schema.ts            users / projects / members / invites / expenses / receipts
docs/                   痛點、資料模型、決策紀錄、架構圖
```

`lib/money.ts` 的 `share()`、`summarize()`、`debts()` 是金額計算的唯一來源，
任何地方都不要重寫一份。改動後 `npm test` 必須仍然通過。

人員的唯一來源是 `members` 表，不是常數。授權的唯一來源是 `lib/dal.ts`。
