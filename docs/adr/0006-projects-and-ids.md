# ADR 0006 — 專案化：ID 當主鍵，配一個 `expenses_readable` view

| | |
|---|---|
| **狀態** | ✅ 生效中 — 取代 [0002](0002-shared-password.md) 的人員部分，修訂 [0001](0001-stack-and-deploy.md) 的「不做多租戶」 |
| **日期** | 2026-09-13 |

[← 決策索引](README.md)

---

**問題**：app 從「一本帳」變成「很多本帳，每本有自己的分攤人頭」。
`lib/people.ts` 裡寫死的 `PEOPLE` 常數不可能再正確——同一個真人在 A 專案叫
Mike、在 B 專案要叫「室友」。

**決定**：新增 `projects` 與 `members` 兩張表，`lib/people.ts` **整個刪掉**
（`PEOPLE` / `PERSON_IDS` / `PersonId` / `nameOf` / `other` 全部）。
`other()` 的「另一個人是確定的」假設在 N 人下直接不成立。

主鍵用 **ID，名字放另一欄**。

**這一條跟鐵則 5 正面衝突**：`select * from expenses` 會看到
`project_id=p_8f3c payer_id=m_a91b`，人看不懂。

**解法不是放棄鐵則，是加一個 read-only view**：

```sql
CREATE VIEW expenses_readable AS ...   -- join projects / members，把 id 換成名字
```

程式查表，人查 view。`select * from expenses_readable` 看到的是
`築巢收據 | 木工二期款 | 45000 | Verna | {Verna,Miki}`，就是鐵則 5 要的效果。
view 是純 join，沒有維護成本，也不可能跟本表不同步。

**為什麼不用名字當主鍵**（認真考慮過）：那樣 `expenses` 一列天生就看得懂，
不需要 view。但代價是 (a) 專案名變成全域唯一，你的「個人」和別人的「個人」會撞名；
(b) 改名＝改主鍵，而「把 Mike 改成室友」正是這次明確要支援的操作——
讓最常做的事變成最危險的事，不划算。

**已知天花板**：專案名不唯一，所以 `expenses_readable` 的 `project` 欄遇到重名
會分不出來。真的重名再在 view 裡補 id 後四碼。
