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

> **已被 0005（登入）與 0006（人員）取代。** 這條在 app 只有一本帳、兩個人共用時
> 是對的；當它要變成「個人記帳 app ＋ 可邀請他人的專案」時，前提整個不成立了。
> 保留原文是為了看得到當初的理由，不要照著做。

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

---

## 0004 — 付款憑證存 Neon 的 bytea，不用外部物件儲存

**問題**：轉帳成功畫面、刷卡完成截圖想留在帳上。原本列在待決事項裡，
理由是「會牽涉檔案儲存」。

**決定**：圖片本體以 `bytea` 存進 Neon，新開一張 `receipts` 表。

- **不用 Vercel Blob／S3**：它們給的是公開網址（不可猜但公開）。轉帳截圖上有
  帳號末碼，不該存在一條繞過門鎖的路徑。存 Neon 的話，圖只能透過
  `/img/[id]` 拿，而那條路徑已經在 `proxy.ts` 的 matcher 裡（鐵則 1：
  真實憑證只存 Neon）。
- **不塞進 `expenses`**：`select * from expenses` 要看得懂是鐵則 5，
  binary 欄位會把 Neon 的 SQL editor 洗版。
- **`on delete cascade`**：刪支出連帶刪圖，不用自己收孤兒資料。
- **不收 SVG**。同源提供的 SVG 會被當文件執行，等於讓上傳的檔案在自家網域
  跑 script。白名單只有 jpeg／png／webp／gif／heic。

**看原圖用新分頁，不做燈箱**：截圖上的帳號、金額就是要放大看的東西，
新分頁有瀏覽器原生的雙指縮放與「儲存圖片」；自己刻 modal 還得自己做 pan/zoom。
哪天一筆有五六張、開始想左右滑，再換成燈箱。

**已知天花板**：原圖照收不壓縮。Neon free 0.5GB ÷ 手機截圖 ~3MB ≈ 150 張，
裝潢期夠用。真的塞滿再加上傳前的 canvas 壓縮（`serverActions.bodySizeLimit`
目前開到 8MB）。

---

## 0005 — 改用 Google 登入，拿掉共用密碼（取代 0002 的登入部分）

**問題**：0002 的共用密碼建立在一個前提上——「系統不需要知道是誰登入的」。
當 app 要能**邀請別人加入某個專案**時，這個前提直接崩了：不知道登入者是誰，
就不知道該給他看哪幾本帳。

而且共用密碼與邀請的目的互相矛盾：留著它，代表每個被邀請的人都得先知道
那串共用密碼才進得來——那還邀請什麼。

**決定**：Google 登入，**自己寫 OAuth，不裝 Auth.js／next-auth**。
`APP_PASSWORD` 連同 `lib/auth.ts` 的 `requirePassword()` 一起刪掉（Vercel 的
環境變數也要移除，不是只刪 code）。

**為什麼自己寫**：authorization code flow 加上 PKCE 大約 120 行，沿用現有
`lib/auth.ts` 的 Web Crypto 風格，零新依賴，也避開 next-auth 對 Next 16
（middleware 改名成 proxy）的相容性未知。這個 app 只接一家 provider、
只要 `openid email profile`，用不到函式庫處理多 provider 的那些抽象。

**session 自己簽，不用 JWT 函式庫**：cookie 值是
`base64url(payload).base64url(HMAC-SHA256)`，payload 只有 `{uid, exp}`。
JWT 的複雜度幾乎全在跟第三方互通（多演算法協商、JWKS 抓取與輪替、`alg` 欄位），
而 `alg` 協商正是 JWT 最有名的漏洞來源（`alg:none`、HS256/RS256 混淆）。
我們簽的東西只有自己讀，單一演算法，**沒有協商面就沒有那類漏洞**。約 30 行。

**`id_token` 不驗 JWS 簽章**：它是我們自己用 TLS 直連 Google 的 token endpoint
拿回來的，OIDC Core 3.1.3.7 步驟 6 明文允許以 TLS server validation 取代驗簽
（只有經瀏覽器轉交的 implicit／hybrid 才非驗不可）。省掉 JWKS 抓取、快取、輪替，
也就不需要 `jose`。**但 claims 還是要驗**：`iss` / `aud` / `exp` / `email_verified`。
也不打 userinfo endpoint——`scope=openid email profile` 時 claims 已經都有了，
再打一次只是多一個 round trip 和多一個失敗點。

**proxy 只做樂觀檢查，真正的授權在 `lib/dal.ts`**。這是 Next 官方的明文定位：

> it should not be used as a full session management or authorization solution
> —— `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`

> Server Functions are not separate routes... Always verify authentication and
> authorization inside each Server Function rather than relying on Proxy alone.
> —— `03-api-reference/03-file-conventions/proxy.md`

所以 proxy 只驗 cookie 的 HMAC 與有效期（不查 DB），「這個人能不能看這個專案」
放在 `lib/dal.ts`，每個 page／action／route handler 開頭呼叫一次。
**`app/img/[id]/route.ts` 原本那句「proxy 已經蓋到，不用再驗」在多使用者之後
就是個漏洞**，必須補上專案成員檢查。

**踩過會痛的兩個坑**（寫進 README）：

- redirect URI 必須**完全字串相符**。Vercel preview 網址每次不同，無法列舉 →
  **preview 環境不做 Google 登入**，或掛一條固定的 branch alias 再加進去。
- Google consent screen **一定要 Publish 成 In production**。留在 Testing 模式時
  只有 test users 名單內的 email 能登入，被邀請的人會直接被 Google 擋掉。
  我們只要 non-sensitive scope，publish 不需要 Google 審核。

**已知天花板**：stateless session 沒有伺服器端撤銷。踢人＝刪 `members` 那列，
對方的 session 仍然有效，但查不到任何專案，畫面是空的。要讓 session 立刻失效
只能換 `SESSION_SECRET`——那會把所有人一起登出。兩個人的 app 可以接受這個核彈選項。

---

## 0006 — 專案化：ID 當主鍵，配一個 `expenses_readable` view

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

---

## 0007 — 分帳改成「選參與者＋均分」，`settled` 換成 `settled_by` 陣列

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

---

## 0008 — 支出性質：花掉／存現金／投資，同一張表

**問題**：個人記帳除了花錢，還有**買股票**和**存現金**。這兩件事不是支出——
錢沒有離開你，只是換了一個口袋。全部混進「總支出」的話，那個數字就沒有意義了。

**決定**：`expenses` 加一欄 `nature`，值是 `spend` / `save` / `invest`，
預設 `spend`。**不開第二張表、不開第二個表單。**

總覽從「總支出一個數字」變成「**花掉 $X**、**留下 $Y**（現金 $A・投資 $B）」。

**股票只記金額，不記股號股數、不算損益、不接股價 API。**
`title` 寫「台積電 x2」、`amount` 寫總金額就夠了。要看持股成本、要看現值損益，
那是投資組合工具，不是記帳工具——真的想要再開新決策，不要現在順手做。

**`nature` 不影響分帳**：兩人合資存 10,000、Verna 出錢，Miki 一樣欠 5,000。
它只影響 `summarize()` 怎麼分類加總。

**付款方式加「行動支付」**（`METHODS` 從三個變四個）。不細分 LINE Pay／街口／
悠遊付——要分就寫在備註。一個 enum 值換成四個是純維護成本，而且對帳時
「我用手機付的」這個資訊量已經足夠。

---

## 0009 — 邀請用連結自己傳 LINE，不寄 email

**問題**：要讓別人加入專案，總得有個東西傳給他。

**一度決定用 email 寄邀請信，後來改掉。** 寄信要接一個服務（Resend 之類）、
要多兩組環境變數、要驗證寄件網域的 SPF/DKIM、還要處理「信進垃圾桶」——
而最可靠的補救措施本來就是「把連結直接顯示出來讓你複製傳 LINE」。
既然那條路是保險，那它就是主路，中間那層可以整個拿掉。

**決定**：產生邀請連結，畫面顯示 ＋ 一顆「複製連結」按鈕，自己用 LINE 傳。
**零新依賴。**

**邀請不是「建立成員」，是「幫一個已經存在的人頭綁上 Google 帳號」。**
設定頁打一個名字就先建好 `members` 那列（`user_id = NULL`），人頭立刻能被勾進
分帳——對方完全不用帳號。想讓他也能自己登入看帳，才產生連結。
這讓「純名字人頭」與「可登入的成員」變成同一個機制的兩個階段，少一套分支。

**token 設計**：`base64url(256-bit 亂數)`，43 個字元。
**DB 只存 `sha256(token)`**——DB 外洩不等於一堆可用的邀請連結。
**7 天到期、一次性**（`accepted_at is null` 才有效）、**owner 隨時可撤銷**。

**接受一定要 POST，不能 GET 自動接受。** LINE（以及其他聊天軟體）會預抓連結
做預覽；GET 就接受的話，一次性 token 在對方點開之前就被預覽爬蟲用掉了。
所以落地頁是一個確認畫面，按下去才是 server action。

落地頁三種狀態：無效／過期（**不透露專案名**，不對陌生人洩漏）、
未登入（先顯示「誰邀請你加入哪本帳」再給登入按鈕，讓人知道自己要登入去哪）、
已登入（確認卡片，加入／先不要）。

**權限只有兩個 boolean 比較，不做 role 系統**：
讀寫支出＝任何成員（這正是邀請的目的）；產生／撤銷邀請、刪專案＝只有 owner；
踢人＝owner 或成員刪自己；改任何人的 display_name＝任何成員；
owner 不能離開專案（要嘛刪專案）。沒有 role enum、沒有 permission 表。
出現第三種角色、或「只能讀不能寫」的需求，才開新決策。
不做 owner 轉讓——真的要換，去 Neon 的 SQL editor 改一個欄位。

**已知天花板**：邀請連結是 bearer token，**拿到連結的人就進得來**，不綁定
特定 Google 帳號。這是「傳 LINE」必然的結果，也是刻意的——強制綁 email 會卡死
「用 A 帳號收訊息、用 B 帳號登入」這個很常見的情況。代價是**轉傳連結＝轉讓邀請**。
對策是到期、一次性、可撤銷，以及 UI 上寫清楚「這條連結誰拿到誰就能加入，
只傳給本人」。不能接受這個代價的話，就得把 email 綁定加回來。
