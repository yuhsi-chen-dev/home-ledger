# 新家裝潢帳本（home-ledger）

記錄新家從裝潢到入住的**所有支出**，並處理與伴侶的**一人一半分帳**。

## 這個專案要回答的四個問題

1. 這間房子總共花了多少錢？（分類：木工／水電／冷氣／軟裝／公共分攤…）
2. 這筆帳付了沒？用什麼付的？（轉帳／信用卡／現金）
3. 下一筆該付的是哪一筆、什麼時候到期？
4. 這筆我先付的錢，Miki 還我了嗎？（或反之）

## 現況與痛點

見 `docs/00-pain-points.md`。資料欄位定義見 `docs/01-data-model.md`。

## 技術棧

| 項目 | 選擇 |
|---|---|
| 框架 | Next.js（App Router） |
| 資料庫 | Postgres（地端 docker／線上 Neon）+ Drizzle ORM，driver 是 postgres.js |
| 部署 | Vercel（push `main` 自動部署） |
| 登入 | 共用密碼（`APP_PASSWORD` 環境變數），無帳號 |

與 `../OW64` 同一套，操作手冊可直接參考 `../OW64/docs/deploy.md`。
理由與「哪些部分不照抄」見 `docs/02-decisions.md`。

## 狀態

- [x] 前置文件
- [x] 技術選型（`docs/02-decisions.md`）
- [x] 專案初始化（Next.js + Drizzle + Tailwind）
- [x] 登入頁與密碼保護
- [x] 第一版可輸入／可查看的介面
- [x] 地端跑起來，登入／新增／標記已付／標記已還／刪除全部實測過
- [ ] 建 Neon branch、設 Vercel 環境變數
- [ ] 部署到 Vercel
- [ ] 匯入既有已付款項

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
| `APP_PASSWORD` | 兩人共用的登入密碼，**設長一點** | 任何頁面都 500 |
| `DATABASE_URL` | 地端指 docker、線上指 Neon 的 `-pooler` 連線字串 | 登入後首頁 500 |

### 地端跑起來

不需要 Neon，docker 的 Postgres 就夠：

```
docker run -d --name hl-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=home_ledger \
  -p 55432:5432 -v hl-pgdata:/var/lib/postgresql/data postgres:17

cp .env.example .env.local   # 填 APP_PASSWORD，DATABASE_URL 已經是這個容器
npm run db:migrate           # 建 expenses 表
npm run dev
```

之後只要 `docker start hl-pg`；資料在 `hl-pgdata` 這個 volume 裡，
`docker rm` 容器不會弄丟。

> 容器**剛建好**的那一次 `db:migrate` 可能報錯——Postgres 初始化時會重啟一次，
> `pg_isready` 會早一步說就緒。再跑一次就好。

### 部署

Vercel 接 `main`，push 就部署。`DATABASE_URL` 與 `APP_PASSWORD` 要在 Vercel
的環境變數設好；`DATABASE_URL` 在 Preview 環境要指向 Neon 的 `dev` branch，
不要讓預覽站寫到正式資料。

**`db:migrate` 沒有掛在 build 上。** 改完 schema 要自己跑，否則 Vercel 會部署
成功、線上卻報 column 不存在，而本機一切正常。細節見 `../OW64/docs/deploy.md`。

## 檔案

```
app/page.tsx       總覽 + 待付／已付清單 + 記一筆表單
app/actions.ts     新增、標記已付、標記已還、刪除（server actions）
app/login/         密碼登入頁與 action
proxy.ts           門鎖：cookie hash 對不上就踢去 /login
lib/people.ts      固定兩人的常數
lib/money.ts       分帳算式（唯一來源）+ 類別／付款方式／分法的列舉
lib/money.test.ts  分帳算式的測試
db/schema.ts       expenses 一張表
docs/              痛點、資料模型、決策紀錄
```

`lib/money.ts` 的 `share()` 與 `summarize()` 是金額計算的唯一來源，
任何地方都不要重寫一份。改動後 `npm test` 必須仍然通過。
