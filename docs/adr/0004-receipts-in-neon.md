# ADR 0004 — 付款憑證存 Neon 的 bytea，不用外部物件儲存

| | |
|---|---|
| **狀態** | ✅ 生效中 |
| **日期** | 2026-09-12 |

[← 決策索引](README.md)

---

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
