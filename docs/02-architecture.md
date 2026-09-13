# 架構全景

這份文件描述**專案化之後的目標架構**：一個人的記帳 app，底下用「專案」分組，
每個專案有自己的分攤人頭，可以產生連結邀請別人一起記。

「築巢收據」從整個 app 降級成其中一個專案。

改動的理由與取捨見 [`docs/adr/`](adr/README.md) 的 0005～0009；欄位定義見
`docs/01-data-model.md`。

## 實作進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| 0 | 文件（這份 + 決策 + 資料模型 + CLAUDE.md + README） | 完成 |
| 1 | 登入換成 Google OAuth、session、DAL | 完成 |
| 2 | 專案化、分帳 N 人化、資料遷移 | 未開始 |
| 3 | 邀請連結、專案設定頁 | 未開始 |
| 4 | 個人記帳 UX（性質、類別、多元支付、總覽） | 未開始 |

未完成的階段在下面的圖裡照樣畫出來——圖描述的是終點，不是現況。

---

## 1. 系統分層

由外往內，每一層只跟相鄰的那層講話。

```
  瀏覽器
    │
    │  HTTP
    ▼
┌───────────────────────────────────────────────────────────────────┐
│ proxy.ts                                            【門鎖・樂觀】│
│                                                                   │
│   只做一件事：驗 session cookie 的 HMAC 與有效期。                │
│   不查資料庫（Next 官方對 proxy 的定位，見決策 0005）。           │
│   驗不過 → 302 /login?next=<原本要去的地方>                       │
│                                                                   │
│   放行不驗：/login  /auth/*  /invite/*  /icon.svg  /_next/*       │
└───────────────────────────────────────────────────────────────────┘
    │ 過了門鎖，但「是誰」還沒決定「能看什麼」
    ▼
┌───────────────────────────────────────────────────────────────────┐
│ app/ 路由層（Server Components / Server Actions / Route Handlers）│
│                                                                   │
│   /                      專案列表（我是成員的所有專案）           │
│   /p/[id]                帳本主畫面（收銀台）                     │
│   /p/[id]/receipt        結帳明細（可列印）                       │
│   /p/[id]/settings       成員、邀請連結、改名、踢人、刪專案       │
│   /img/[id]              付款憑證原圖                             │
│   /invite/[token]        邀請落地頁（未登入也能開）               │
│   /login                 一顆 Google 按鈕                         │
│   /auth/google           OAuth 起點                               │
│   /auth/google/callback  OAuth 回跳                               │
└───────────────────────────────────────────────────────────────────┘
    │ 每一個 page / action / route handler 的第一行
    ▼
┌───────────────────────────────────────────────────────────────────┐
│ lib/dal.ts                                    【授權・唯一入口】  │
│                                                                   │
│   currentUser()      讀 cookie → 查 users（react cache 去重）     │
│   requireUser()      沒登入 → redirect("/login")                  │
│   requireProject(id) 不是這個專案的成員 → notFound()              │
│                      （不是 403——403 等於承認這個專案存在）       │
│                                                                   │
│   proxy 擋不住 Server Action（它不是獨立路由），所以這一層是      │
│   真正的授權邊界，不是補強。                                      │
└───────────────────────────────────────────────────────────────────┘
    │                                    │
    │ 資料                               │ 算錢
    ▼                                    ▼
┌────────────────────────┐   ┌──────────────────────────────────────┐
│ db/  資料層            │   │ lib/money.ts      【金額唯一來源】   │
│                        │   │                                      │
│  schema.ts  表定義     │   │  share(row, member)   某人這筆負擔   │
│  index.ts   postgres.js│   │  summarize(rows)      總覽           │
│             + drizzle  │   │  debts(net)           誰轉給誰多少   │
│  migrations/           │   │                                      │
│                        │   │  整數元、不碰浮點。任何頁面、任何    │
│  Neon（線上）          │   │  action 都不准自己重算一份。         │
│  docker pg（地端）     │   │  改動後 npm test 必須仍然通過。      │
│  同一個 driver，       │   └──────────────────────────────────────┘
│  只差 DATABASE_URL     │
└────────────────────────┘
```

### 為什麼授權要放兩層

`proxy.ts` 跑在每一個請求前面，包含 prefetch，所以它必須快、不能查 DB——它只能
回答「這個 cookie 是我們簽的嗎」。它**回答不了**「這個人是不是這個專案的成員」。

更關鍵的是 Server Action 根本不是獨立路由，proxy 的 matcher 蓋不到它。
只靠 proxy 的話，任何人只要湊出一個 action 請求就能改別人的帳。

所以：**proxy 是門鎖，`lib/dal.ts` 才是授權。** 每個 page、每支 action、
每個 route handler 開頭都要自己呼叫一次，沒有例外——包含 `/img/[id]`，
它現在那句「proxy 已經蓋到，不用再驗」在多使用者之後就是個漏洞。

---

## 2. 資料表關聯

```
┌─────────────────────┐
│ users               │  真人，一人一列。Google 登入後才存在。
│─────────────────────│
│ id            (pk)  │
│ google_sub (unique) │◄── 認這個，不認 email（email 會變）
│ email               │
│ name, picture       │
└─────────┬───────────┘
          │
          │ owner_user_id (nullable)
          ▼
┌─────────────────────┐
│ projects            │  一本帳。「築巢收據」是一列，個人帳本也是一列。
│─────────────────────│
│ id            (pk)  │
│ name                │  可重複，不是 unique
│ owner_user_id       │  NULL = 還沒被認領（migration 建的那本）
│ archived            │
└─────────┬───────────┘
          │ 1
          │
          │ N                                    ┌──────────────────┐
┌─────────▼───────────┐                          │ invites          │
│ members             │  「人頭」＝專案裡的一個  │──────────────────│
│─────────────────────│   分攤對象               │ token_hash  (pk) │
│ id            (pk)  │◄─────────────────────────│ member_id        │
│ project_id    (fk)  │                          │ project_id       │
│ user_id (fk,NULL可) │  NULL = 純名字人頭，     │ invited_by       │
│ display_name        │  對方不用帳號也能被分攤  │ expires_at       │
└─────────┬───────────┘                          │ accepted_at      │
          │                                      └──────────────────┘
          │ payer_id                              接受後把 user_id
          │ participants[]                        補進 members 那列
          │ settled_by[]
          ▼
┌───────────────────────────────────────────┐
│ expenses                                  │  一筆支出＝一列（鐵則 5）
│───────────────────────────────────────────│
│ id              (pk)                      │
│ project_id      (fk projects)             │
│ date, title, amount, category, vendor     │
│ nature          spend | save | invest     │◄── 花掉／存現金／投資
│ group_label                               │    同一張表，只差這一欄
│ due_date, paid, paid_date, method         │
│ payer_id        (fk members)              │◄── 誰掏錢
│ participants    text[]  member id         │◄── 這筆誰要分（均分）
│ settled_by      text[]  member id         │◄── 誰已經還錢給 payer
│ settled_date, note                        │
└─────────┬─────────────────────────────────┘
          │ 1
          │ N   on delete cascade
┌─────────▼───────────┐
│ receipts            │  付款憑證圖，bytea 存 Neon（決策 0004，不動）
│─────────────────────│
│ id            (pk)  │
│ expense_id    (fk)  │
│ mime, bytes         │
└─────────────────────┘
```

### `expenses_readable` — 給人看的那一面

主鍵用 id，代價是 `select * from expenses` 看到一排 `p_8f3c` / `m_a91b`，
鐵則 5 直接破功。解法不是放棄鐵則，是加一個 read-only view：

```
  程式查表 ──────────►  expenses            project_id=p_8f3c  payer_id=m_a91b
                                            participants={m_a91b,m_77de}

  人查 view ─────────►  expenses_readable   project=築巢收據   payer=Verna
                                            participants={Verna,Miki}
```

`select * from expenses_readable` 就是原本 `select * from expenses` 要的效果。
view 是純 join，沒有任何維護成本，也不會跟本表不同步。

### 為什麼分帳不開子表

「誰分這筆」存成 `participants text[]`，不是 `expense_splits` 子表。

子表唯一的贏面是「每人可以填不同金額」——而分帳規則就是**均分**，那個需求不存在。
為一個不存在的需求換來：每次新增／編輯變成 delete-and-reinsert 要包 transaction、
首頁多一次 join、一筆支出散在三張表。鐵則 5 和「不做沒被要求的抽象」同時禁止。

金額永遠由 `share()` 現算，子表存 amount 反而會跟 `amount` 欄位不同步。

### 為什麼 `settled` 從 boolean 變成陣列

這不是加功能，是修正確性。三人分一筆、Miki 還了 Bob 沒還——單一 boolean
表達不出這個狀態，餘額會算錯。兩人專案時 `settled_by` 只會是 `{}` 或 `{對方}`，
跟舊的 boolean 完全等價。

---

## 3. Google 登入流程

```
 瀏覽器                    home-ledger                      Google
   │                            │                              │
   │  GET /p/xxx                │                              │
   ├───────────────────────────►│                              │
   │                            │ proxy: 沒有有效 session      │
   │  302 /login?next=/p/xxx    │                              │
   │◄───────────────────────────┤                              │
   │                            │                              │
   │  點「用 Google 登入」      │                              │
   │  GET /auth/google?next=..  │                              │
   ├───────────────────────────►│                              │
   │                            │ state    = 128-bit 亂數      │
   │                            │ verifier = 256-bit 亂數      │
   │                            │ challenge= SHA256(verifier)  │
   │                            │                              │
   │  302 accounts.google.com   │                              │
   │  Set-Cookie: oauth=        │                              │
   │    state|verifier|next     │  httpOnly・10 分鐘           │
   │    path=/auth/google       │  path 限定，不會到處亂送     │
   │    sameSite=lax  ◄─────────┤  回跳是 top-level GET，      │
   │◄───────────────────────────┤  strict 會讓 cookie 送不出去 │
   │                            │                              │
   │  ?client_id&redirect_uri&scope=openid email profile       │
   │   &state&code_challenge&code_challenge_method=S256        │
   │   &prompt=select_account                                  │
   ├──────────────────────────────────────────────────────────►│
   │                            │                              │
   │              使用者選帳號、按同意                         │
   │                            │                              │
   │  302 /auth/google/callback?code=...&state=...             │
   │◄──────────────────────────────────────────────────────────┤
   ├───────────────────────────►│                              │
   │                            │                              │
   │                            │ ① cookie 的 state 是否等於   │
   │                            │    網址帶回來的 state？      │
   │                            │    不等 → 直接失敗，不補救   │
   │                            │                              │
   │                            │ ② POST /token（伺服器直連）  │
   │                            │    code + code_verifier      │
   │                            │    + client_secret           │
   │                            ├─────────────────────────────►│
   │                            │                              │
   │                            │        { id_token, ... }     │
   │                            │◄─────────────────────────────┤
   │                            │                              │
   │                            │ ③ 不驗 JWS 簽章——這是我們    │
   │                            │    自己用 TLS 直連拿回來的   │
   │                            │    （OIDC Core 3.1.3.7 允許）│
   │                            │    但要驗 claims：           │
   │                            │    iss / aud / exp /         │
   │                            │    email_verified            │
   │                            │                              │
   │                            │ ④ upsert users（認 sub）     │
   │                            │ ⑤ 零 membership → 自動建一本 │
   │                            │    「{名字}的帳」            │
   │                            │                              │
   │  302 /p/xxx（cookie 裡的 next）                           │
   │  Set-Cookie: session=<payload>.<hmac>                     │
   │    httpOnly・secure・sameSite=lax・30 天                  │
   │  Set-Cookie: oauth=（刪掉）                               │
   │◄───────────────────────────┤                              │
```

### session cookie 長什麼樣

```
   base64url({"uid":"u_...","exp":1770000000000}) . base64url(HMAC-SHA256)
   └──────────────── payload ──────────────────┘   └──── 簽章 ────┘
                                                    key = SESSION_SECRET
```

只放 `uid` 和 `exp`。不放 email／名字／專案清單——那些改了就得重新登入，
而且 cookie 每個請求都要傳。

不裝 JWT 函式庫：JWT 的複雜度幾乎全在跟第三方互通（多演算法協商、JWKS 抓取與
輪替），而 `alg` 協商正是 JWT 最有名的漏洞來源。我們簽的東西只有自己讀，
單一演算法，沒有協商面就沒有那類漏洞。約 30 行，零依賴。

---

## 4. 邀請流程

前提：邀請不是「建立成員」，是**幫一個已經存在的人頭綁上 Google 帳號**。

```
  ┌── 步驟 0：人頭先存在（不需要邀請） ──────────────────────────┐
  │                                                              │
  │  設定頁打一個名字 → members 新增一列（user_id = NULL）       │
  │  這個人頭立刻能被勾進分帳，對方完全不用帳號。                │
  │  很多情況到這裡就夠了——只是要記「這筆室友也有分」。          │
  └──────────────────────────────────────────────────────────────┘
                              │
                              │ 想讓對方也能自己登入看帳、自己記帳
                              ▼
  ┌── 步驟 1：產生連結 ──────────────────────────────────────────┐
  │                                                              │
  │  token = base64url(256-bit 亂數)        43 個字元            │
  │  DB 只存 sha256(token) ──► invites.token_hash                │
  │       └─ DB 外洩 ≠ 一堆可用的邀請連結                        │
  │                                                              │
  │  7 天到期・一次性・owner 隨時可撤銷                          │
  │                                                              │
  │  畫面顯示：https://<網域>/invite/<token>   [複製] [撤銷]     │
  └──────────────────────────────────────────────────────────────┘
                              │
                              │  自己用 LINE 傳給對方
                              │  （不寄信——沒有寄信服務、沒有網域驗證、
                              │    沒有進垃圾桶的問題）
                              ▼
  ┌── 步驟 2：對方點開 /invite/<token> ──────────────────────────┐
  │                                                              │
  │  proxy 放行，未登入也打得開。三種畫面：                      │
  │                                                              │
  │   (a) 無效／過期／已被用掉                                   │
  │       ┌────────────────────────────────────┐                 │
  │       │  這個邀請連結無效或已失效          │                 │
  │       └────────────────────────────────────┘                 │
  │       不說是哪個專案——不對陌生人洩漏專案名。                 │
  │                                                              │
  │   (b) 有效但還沒登入                                         │
  │       ┌────────────────────────────────────┐                 │
  │       │  Verna 邀請你一起記                │                 │
  │       │  「築巢收據」的帳                  │                 │
  │       │                                    │                 │
  │       │     [ 用 Google 登入並加入 ]       │                 │
  │       └────────────────────────────────────┘                 │
  │       先看到自己被邀請進什麼，再決定要不要登入。             │
  │       按鈕 → /auth/google?next=/invite/<token>               │
  │       登入後回到這一頁，token 還在網址上，沒被消耗。         │
  │                                                              │
  │   (c) 已登入                                                 │
  │       ┌────────────────────────────────────┐                 │
  │       │  要不要加入「築巢收據」？          │                 │
  │       │                                    │                 │
  │       │  加入後你可以查看這本帳，          │                 │
  │       │  也可以自己記帳。                  │                 │
  │       │                                    │                 │
  │       │     [ 加入 ]      [ 先不要 ]       │                 │
  │       └────────────────────────────────────┘                 │
  └──────────────────────────────────────────────────────────────┘
                              │
                              │ 按「加入」＝ POST（server action）
                              │
                              │ 為什麼不能是 GET：LINE 會預抓連結做
                              │ 預覽。GET 就接受的話，一次性 token 在
                              │ 對方點開之前就被預覽爬蟲用掉了。
                              ▼
  ┌── 步驟 3：acceptInvite(token) ───────────────────────────────┐
  │                                                              │
  │  requireUser()          重新驗，不信任頁面已經檢查過         │
  │  transaction {                                               │
  │    重查 invite（沒過期、沒被接受）                           │
  │    已經是成員 → 標記 accepted 後直接進專案（冪等，不報錯）   │
  │    否則 → members.user_id = 我                               │
  │           invites.accepted_at = now()                        │
  │  }                                                           │
  │  redirect /p/<id>                                            │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
             這本帳出現在他的 / 專案列表，可讀也可寫
```

### 權限：兩個 boolean 比較，不是權限系統

| 動作 | 誰可以 |
|---|---|
| 查看／新增／編輯／刪除這本帳的支出 | **任何成員**（這正是邀請的目的） |
| 產生邀請連結、撤銷邀請、刪專案 | 只有 owner |
| 踢人 | owner，或成員刪自己（＝離開） |
| 改任一成員的 display_name | 任何成員 |
| owner 離開專案 | 不允許（要嘛刪專案） |

沒有 role enum、沒有 permission 表、沒有 ability 框架。
出現第三種角色、或「只能讀不能寫」的需求，才開新決策。

---

## 5. 一筆支出怎麼被算成「誰欠誰」

```
   expenses 一列
   ┌──────────────────────────────────────────────┐
   │ amount       = 1000                          │
   │ payer_id     = Verna                         │
   │ participants = { Verna, Miki, Bob }          │
   │ settled_by   = { Miki }                      │
   │ paid         = true                          │
   └──────────────────────────────────────────────┘
                      │
                      ▼  share(row, member)
   ┌──────────────────────────────────────────────┐
   │  n    = 3                                    │
   │  base = floor(1000 / 3) = 333                │
   │  rem  = 1000 - 333*3    = 1                  │
   │  餘數歸付款人（不在名單內就歸排序第一位）    │
   │                                              │
   │  Verna 334   Miki 333   Bob 333              │
   │  Σ = 1000 ✓  整數運算，不碰浮點              │
   └──────────────────────────────────────────────┘
                      │
                      ▼  只算「已付、且還沒還」的
   ┌──────────────────────────────────────────────┐
   │  Miki 在 settled_by 裡 → 跳過                │
   │  Bob  欠 Verna 333                           │
   │                                              │
   │  net = { Verna: +333, Miki: 0, Bob: -333 }   │
   │  Σ net === 0 恆成立                          │
   └──────────────────────────────────────────────┘
                      │
                      ▼  debts(net)  貪心配對
   ┌──────────────────────────────────────────────┐
   │  Bob ──$333──► Verna                         │
   │  筆數最少的還錢指令。UI 只讀這個，           │
   │  不自己算一份。                              │
   └──────────────────────────────────────────────┘
```

未付的錢不進 `net`——還沒付出去的錢談不上誰欠誰。
`nature` 不影響分帳：兩人合資存 10,000、Verna 出錢，Miki 一樣欠 5,000。
它只影響總覽怎麼分類加總（花掉 vs 留下）。

---

## 6. 環境變數

| 名稱 | 用途 | 沒設會怎樣 |
|---|---|---|
| `DATABASE_URL` | 地端指 docker、線上指 Neon 的 `-pooler` 連線字串 | 任何讀資料的頁面 500 |
| `GOOGLE_CLIENT_ID` | OAuth client 識別 | 登入頁按下去就爆 |
| `GOOGLE_CLIENT_SECRET` | 換 token 時認證 client | callback 換不到 token |
| `SESSION_SECRET` | HMAC 簽 session，`openssl rand -base64 32` | 所有頁面 500 |
| `APP_URL` | OAuth `redirect_uri` 與邀請連結的絕對網址 | redirect_uri 對不上，Google 擋掉 |
| `ALLOWED_EMAILS` | **階段 1／2 過渡**：能登入的 email（逗號分隔） | 一個人都登不進去 |

`SESSION_SECRET` 地端與線上**各一把，不要共用**。換掉它等於把所有人登出。

沒有任何寄信相關的變數——邀請是連結，不是信。

`ALLOWED_EMAILS` 會在階段 2 刪掉：那時候「誰能登入」本來就不該是門檻，
「登入後看得到哪幾本帳」才是，而那件事由 `members` 決定。
