# 資料欄位定義

一筆支出（expense）＝一次要付給某人的錢。分期款是**多筆**，不是一筆。

所有金額都是 **TWD 整數元**。沒有小數、沒有匯率、不用浮點數做判斷。

表的關聯圖見 `docs/02-architecture.md` §2；為什麼長這樣見 `docs/adr/` 的
[0006](adr/0006-projects-and-ids.md)（ID 當主鍵）、
[0007](adr/0007-split-participants.md)（分帳）、
[0008](adr/0008-expense-nature.md)（性質）。

---

## user

Google 登入後才存在的一列。**這張表跟「分帳人頭」是兩回事**——人頭是
`member`，一個人頭可以完全沒有對應的 user。

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `google_sub` | string | Google 的使用者識別碼，**unique**。認這個，不認 email |
| `email` | string | 從 Google claims 來，會變 |
| `name` | string | 從 Google claims 來 |
| `picture` | string? | 頭像網址 |
| `created_at` | timestamptz | |

`email` 會變（改名、換網域），所以主鍵對應一律用 `google_sub`。

## project

一本帳。「築巢收據」是一列，個人帳本也是一列。

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `name` | string | 顯示名稱。**可以重複**，不是 unique |
| `owner_user_id` | string? | 建立者。NULL＝還沒被認領（migration 建的那本） |
| `archived` | bool | 收起來不顯示在列表，但資料還在 |
| `created_at` | timestamptz | |

owner 能做的事只有三件：產生／撤銷邀請連結、踢人、刪專案。其他所有動作
任何成員都能做。不做 role 系統（決策 0009）。

## member

**專案底下的一個分攤對象。** 同一個真人在 A 專案叫 Mike、在 B 專案叫「室友」，
就是兩列不同的 member 指向同一個 user。

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `project_id` | string | 屬於哪本帳。刪專案連帶刪（cascade） |
| `user_id` | string? | **NULL＝純名字人頭**，對方不用帳號也能被分攤 |
| `display_name` | string | 在這本帳裡叫什麼。可隨時改 |
| `created_at` | timestamptz | |

`(project_id, user_id)` 在 `user_id` 非 NULL 時唯一——同一個人不能在同一本帳
裡有兩個人頭。

`display_name` 是**任何成員都能改**的：Google 給的名字叫 Mike，你想在這本帳裡
看到「室友」就改成室友，不影響對方自己看到的其他專案。

## invite

一條邀請連結。它的作用是**幫一個已經存在的 member 綁上 user_id**，
不是「建立成員」。

| 欄位 | 型態 | 說明 |
|---|---|---|
| `token_hash` | string | `sha256(token)`。**明文 token 不進資料庫** |
| `project_id` | string | |
| `member_id` | string | 要綁的是哪一個人頭 |
| `invited_by` | string | 誰發的 |
| `expires_at` | timestamptz | 發出後 7 天 |
| `accepted_at` | timestamptz? | 非 NULL＝已用掉。一次性 |

有效的定義：`accepted_at is null` 且 `expires_at > now()`。
撤銷＝刪掉這一列。

## expense

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `project_id` | string | 屬於哪本帳 |
| `date` | `YYYY-MM-DD` | 費用發生／被通知的日期，**不是付款日** |
| `title` | string | 「木工二期款」「台積電 x2」 |
| `amount` | int | TWD 整數元 |
| `nature` | enum | `spend` 花掉｜`save` 存現金｜`invest` 投資 |
| `category` | string | 自由文字。內建類別或打單時臨時自訂的名字 |
| `category_icon` | string? | 自訂類別才有值 |
| `vendor` | string | 收款人／存進哪個帳戶／哪家券商 |
| `group_label` | string? | 同一工程的分期共用同一值，例如 `木工-主臥櫃體` |
| `due_date` | `YYYY-MM-DD`? | 付款期限；沒有就留空 |
| `paid` | bool | 是否已付出去 |
| `paid_date` | `YYYY-MM-DD`? | 實際付款日 |
| `method` | enum? | `轉帳` `信用卡` `現金` `行動支付`；未付時留空 |
| `payer_id` | string | 誰掏的錢（member id）。未付時填「預計由誰付」 |
| `participants` | string[] | **這筆誰要分**（member id）。勾到的人均分 |
| `settled_by` | string[] | 已經把錢還給 payer 的人（member id） |
| `settled_date` | `YYYY-MM-DD`? | 最近一次收到還款的日期，純註記 |
| `note` | string? | 備註（例：「師傅說現場收現」） |
| `created_at` | timestamptz | |

`participants` 至少要有一個人（DB 層有 check constraint）。
只勾一個人＝那個人全付。

`vendor` 記的是**收款人**：鄰居／管委會的公共分攤寫「管委會」，
存錢寫銀行名，買股票寫券商。他們不是分帳人。

## receipt

付款憑證圖。決策 0004，這次改動完全不動它。

| 欄位 | 型態 | 說明 |
|---|---|---|
| `id` | string | 唯一值 |
| `expense_id` | string | 刪支出連帶刪圖（cascade） |
| `mime` | string | 白名單：jpeg／png／webp／gif／heic。**不收 SVG** |
| `bytes` | bytea | 圖片本體，存 Neon |
| `created_at` | timestamptz | |

## expenses_readable（view，不是表）

`expenses` join `projects` 與 `members`，把 id 全部換成名字。
純 read-only，給人在 Neon 的 SQL editor 用的。

```
select * from expenses_readable;
→ 築巢收據 | 木工二期款 | 45000 | Verna | {Verna,Miki} | {Miki}
```

程式一律查 `expenses`，不查 view。

---

## 衍生計算（不要存，算出來）

全部由 `lib/money.ts` 負責，是唯一來源。任何頁面、任何 action 都不准重算一份。

### 某人在某一筆的應負擔 — `share(row, member)`

```
member 不在 participants 裡          → 0
n    = participants.length
base = floor(amount / n)
rem  = amount - base * n                  // 0 ≤ rem ≤ n-1
餘數接收者 = payer 在 participants 裡 ? payer : 排序後第一個 participant
member === 餘數接收者 ? base + rem : base
```

保證 `Σ 各人負擔 === amount`，純整數運算。

### 總覽 — `summarize(rows)`

| 輸出 | 定義 |
|---|---|
| `total` | Σ `amount`（花掉＋留下，全部） |
| `spent` | Σ `amount where nature = 'spend'` |
| `saved` | Σ `amount where nature = 'save'` |
| `invested` | Σ `amount where nature = 'invest'` |
| `kept` | `saved + invested` |
| `paid` | Σ `amount where paid` |
| `unpaid` | `total - paid` |
| `burden` | member id → Σ `share()`，不分已付未付 |
| `net` | member id → 淨額。**正＝別人欠他**，`Σ net === 0` |

`net` 只計入**已付、且該人不在 `settled_by` 裡**的那些筆——還沒付出去的錢
談不上誰欠誰。

### 誰轉給誰多少 — `debts(net)`

把 `net` 貪心配對成筆數最少的轉帳指令：
`[{ from, to, amount }]`。UI 顯示還錢指令只讀這個。

### 其他

- 下一筆要付的 = `!paid` 且有 `due_date`，依 `due_date` 排序
- 某個類別總共花多少 = 依 `category` group by

---

## 邊界情況

- `participants` 只有一個人、而那個人剛好就是 `payer` → 不產生任何欠款。
  **不要為此把他塞進 `settled_by`**：欠款額算出來本來就是 0，
  存一個「已還」只是用第二種方式表達同一件事，兩邊還會不同步。
- `settled_by` 只在 `paid = true` 時有意義。取消已付一定要一起把 `settled_by`
  清空，否則會留下「沒付錢但已結清」的矛盾狀態。
- **`settled_by` 是陣列不是 boolean**，因為三人以上時「Miki 還了、Bob 沒還」
  必須分別記。兩人時它只會是 `{}` 或 `{對方}`，跟舊的 boolean 等價。
- 均分除不盡時，餘數歸 `payer`（避免小數）。`payer` 不在分帳名單裡時
  歸排序後第一個參與者——需要一個**確定**的接收者，且不受陣列存放順序影響。
- 信用卡已刷但還沒入帳，仍算 `paid = true`；帳單對帳不是這個工具的事。
- `nature` **不影響分帳**。兩人合資存 10,000、Verna 出錢，Miki 一樣欠 5,000。
  它只影響總覽怎麼分類加總。
- 買股票只記金額，不記股數與成本、不算損益。要看持股就換一個工具（決策 0008）。
- `paid` / `settled_by` 一律由使用者手動確認，**不從到期日之類的東西推論**
  （鐵則 3）。
