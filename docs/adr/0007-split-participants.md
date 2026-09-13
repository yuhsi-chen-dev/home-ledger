# ADR 0007 — 分帳改成「選參與者＋均分」，`settled` 換成 `settled_by` 陣列

| | |
|---|---|
| **狀態** | ✅ 生效中 |
| **日期** | 2026-09-13 |

[← 決策索引](README.md)

---

**問題**：舊的 `split` 是 `half` / `verna_only` / `miki_only` 三選一，
寫死兩個人。N 人之後表達不了「四人專案裡這筆只有我跟室友分」。

**決定**：每筆勾「這筆誰要分」，勾到的人均分，餘數歸付款人；勾一個人＝他全付。
存成 `participants text[]`（member id），不開 `expense_splits` 子表。

**為什麼不開子表**：子表唯一的贏面是「每人可以填不同金額」——而規則就是均分，
那個需求不存在。為一個不存在的需求換來：每次新增／編輯變成 delete-and-reinsert
要包 transaction、首頁多一次 join、一筆支出散在三張表（鐵則 5）。
而且金額永遠由 `share()` 現算，子表存 amount 反而會跟 `amount` 欄位不同步。

**餘數規則推廣到 N 人**（純整數，鐵則 2）：

```
base = floor(amount / n)
rem  = amount - base * n          // 0 ≤ rem ≤ n-1
餘數歸付款人；付款人不在分帳名單裡，就歸排序後第一個參與者
```

`base*n + rem === amount` 是恆等式。兩人時退化成原本的「餘 1 元歸 payer」，
舊測試的斷言值一個都不用改——這也是遷移正確性最強的證據。

付款人不在名單時需要一個**確定**的餘數接收者，選排序第一位是為了讓結果
不受陣列存放順序影響。

**`settled` boolean 換成 `settled_by text[]`——這不是加功能，是修正確性。**
三人分一筆、Miki 還了 Bob 沒還，單一 boolean 表達不出這個狀態，餘額會算錯。
兩人專案時 `settled_by` 只會是 `{}` 或 `{對方}`，跟舊 boolean 完全等價。

**`balance` 純量換成 `net: Record<memberId, number>`**（正＝別人欠他，Σ net === 0），
另加 `debts(net)` 把它貪心配對成「誰轉給誰多少」，是 UI 顯示還錢指令的唯一來源。

鐵則 3 不變：`settled_by` 只能由使用者手動勾，不從任何東西推論。
