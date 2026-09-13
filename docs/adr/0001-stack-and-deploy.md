# ADR 0001 — 技術棧與部署照 OW64 走

| | |
|---|---|
| **狀態** | 🟡 **部分修訂** — 技術棧本身仍然生效；但「這個 app 只有一份帳本、不要複製多租戶」那段已被 [0006](0006-projects-and-ids.md) 推翻 |
| **日期** | 2026-09-05 |

[← 決策索引](README.md)

---

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
