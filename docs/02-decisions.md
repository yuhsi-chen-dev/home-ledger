# 決策紀錄

## 0001 — 技術棧與部署照 OW64 走

**決定**：Next.js（App Router）+ Neon Postgres + Drizzle ORM + Vercel，
與 `../OW64` 同一套。

**理由**：不是因為這個 app 需要這種規模，而是因為這套已經在隔壁跑起來了。
Vercel／Neon 的帳號、免費額度、`db:generate` / `db:migrate` 的操作手冊、
「migration 沒掛在 build 上」這種踩過的坑，全都可以直接抄
（見 `../OW64/docs/deploy.md`）。學新東西的成本大於省下的複雜度。

**不照抄的部分**：OW64 是多租戶（很多人各自有資料，`db/writes.ts` 每一支都吃
`userId` 並寫進 WHERE）。這個 app **只有一份帳本，兩個人共用**，
不要複製那套資料隔離機制。

**跟著這個決定來的**：本機與線上分開兩條 Neon branch；`main` push 即部署；
`db:migrate` 要手動跑，不要以為 build 會幫你跑。

---

## 0002 — 共用一組密碼，不做帳號；人員寫死兩人

**問題**：部署到 Vercel 就是一個公開網址。沒有任何門鎖，任何拿到網址的人
都能看到、改掉整本裝潢帳（金額、廠商、誰欠誰）。

**決定**：一個 `/login` 頁面、一個密碼欄位、密碼放環境變數 `APP_PASSWORD`，
兩個人自己知道。**不裝 Auth.js，不做 Google 登入，不做帳號。**

- 驗證比對 sha256 hash：cookie 存 `sha256(輸入密碼)`，middleware 比對
  `sha256(APP_PASSWORD)`。不存明文（cookie 洩漏時不會直接洩漏密碼本身），
  比 hash 也讓時序攻擊沒有意義。用 Web Crypto，零依賴、Edge runtime 可跑。
- cookie 一律 `httpOnly` + `secure` + `sameSite=lax`。
- **系統不知道是誰登入的**，這是刻意的。沒有 session user、沒有 `userId`、
  沒有多租戶。兩個人看到完全同一份資料。

**為什麼不用 Google 登入**（一度考慮過，抄 `../OW64/auth.ts`）：
它會帶進 Google Cloud OAuth client 的設定、`AUTH_SECRET`、
`next-auth` 這個依賴，換來的是「知道登入者是誰」——而這個 app 不需要知道。
兩人共用一本帳，登入只是門鎖。

**這個決定的已知天花板**：公開網址 + 共用密碼可以被暴力嘗試，而且沒有
嘗試次數限制。對策是**密碼設長一點**（不是四位數生日）。
真的被打再加 rate limit，不要現在就做。

**人員固定兩人，寫死在常數裡**：

```ts
export const PEOPLE = [
  { id: "verna", name: "Verna" },
  { id: "miki",  name: "Miki"  },
] as const;
```

`payer`（誰付的）與分帳歸屬的下拉選單都渲染這個常數。要改名改這一行。
**不做人員管理頁面**——一個永遠只有兩筆資料的 CRUD 頁面是純維護成本。
真的出現第三個要分攤的人再開新決策。

**注意**：鄰居／管委會是 `vendor`（收款人，純文字），**不是**分帳人。
「跟鄰居分攤保護工程」是「我們兩人合出這筆錢付給管委會」，
分攤對象仍然只有 Verna 和 Miki 兩個。

---

## 0003 — driver 用 postgres.js，不用 Neon 的 HTTP driver

**問題**：原本照 OW64 用 `@neondatabase/serverless`（neon-http driver）。
它走 Neon 的 HTTP API，**接不上一般的 Postgres**，所以地端要嘛開一個
neon http proxy 容器，要嘛連線到雲端的 Neon dev branch——都是為了跑起來
多養一個東西。

**決定**：改用 `postgres`（postgres.js）+ `drizzle-orm/postgres-js`。
一般 Postgres wire protocol，**地端 docker 與 Neon 都通，只差 DATABASE_URL**。
`db/index.ts` 因此沒有任何分支，也不用第二個 driver。

- 連 Neon 一定要用 **`-pooler`** 那條連線字串（pgbouncer）。
- `postgres(url, { prepare: false })` 是 pgbouncer transaction pooling 的要求，
  不要拿掉。

**已知天花板**：serverless function 每次冷啟都要開 TCP 連線，比 neon-http 的
fetch 貴。兩個人記帳撞不到，真的撞到再換回 `@neondatabase/serverless`
（那時要接受地端得多跑一個 proxy）。
