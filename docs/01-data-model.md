# 資料欄位定義

一筆支出（expense）＝一次要付給某人的錢。分期款是**多筆**，不是一筆。

## expense

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `date` | `YYYY-MM-DD` | 費用發生／被通知的日期 |
| `title` | string | 「木工二期款」「保護工程分攤」 |
| `amount` | int | TWD 整數元 |
| `category` | enum | `木工` `水電` `冷氣` `軟裝` `公共分攤` `家電` `雜支` |
| `vendor` | string | 廠商／收款人；鄰居分攤就寫「管委會」或鄰居稱謂 |
| `project_group` | string? | 同一工程的分期共用同一值，例如 `木工-主臥櫃體` |
| `due_date` | `YYYY-MM-DD`? | 付款期限；沒有就留空 |
| `paid` | bool | 是否已付給對方 |
| `paid_date` | `YYYY-MM-DD`? | 實際付款日 |
| `method` | enum? | `轉帳` `信用卡` `現金`；未付時留空 |
| `payer` | enum | `verna` \| `miki`；未付時填「預計由誰付」 |
| `split` | enum | `half`（各半）\| `verna_only` \| `miki_only` |
| `settled` | bool | 對方是否已把該還的部分還清 |
| `settled_date` | `YYYY-MM-DD`? | 還款日 |
| `note` | string? | 備註（例：「師傅說現場收現」） |

## 衍生計算（不要存，算出來）

- 總支出 = Σ `amount`
- 已付 = Σ `amount where paid`
- 未付 = Σ `amount where !paid`
- 某人應負擔 = Σ (`half` → `amount`/2；`<某人>_only` → `amount`；另一人 only → 0)
- 誰欠誰 = Σ over 已付且未 settled 的每筆，把「該筆非付款人應負擔的金額」
  記成「非付款人欠付款人」。全部加總後只會剩下一個方向的一個數字。
- 下一筆要付的 = `!paid` 且有 `due_date`，依 `due_date` 排序

## 邊界情況

- `split` 指定的唯一負擔人剛好就是 `payer`（例如 `verna_only` + `payer=verna`）
  → 不產生任何欠款。**不要為此把 `settled` 存成 true**：欠款額算出來本來就是 0，
  存一個 true 只是用第二種方式表達同一件事，兩邊還會不同步。
- `settled` 只在 `paid = true` 時有意義。取消已付一定要一起把 `settled` 清掉，
  否則會留下「沒付錢但已結清」的矛盾狀態。
- 還錢的人一定是 `payer` 以外的那個人，所以**不需要** `settled_by` 欄位。
- 奇數金額各半時，餘 1 元歸 `payer`（避免小數）。
- 信用卡已刷但還沒入帳，仍算 `paid = true`；帳單對帳不是這個工具的事。
