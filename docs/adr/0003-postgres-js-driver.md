# ADR 0003 — driver 用 postgres.js，不用 Neon 的 HTTP driver

| | |
|---|---|
| **狀態** | ✅ 生效中 |
| **日期** | 2026-09-05 |

[← 決策索引](README.md)

---

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
