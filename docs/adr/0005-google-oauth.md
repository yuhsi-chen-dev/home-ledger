# ADR 0005 — 改用 Google 登入，拿掉共用密碼

| | |
|---|---|
| **狀態** | ✅ 生效中 — 取代 [0002](0002-shared-password.md) 的登入部分 |
| **日期** | 2026-09-13 |

[← 決策索引](README.md)

---

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
