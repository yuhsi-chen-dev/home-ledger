
/** 登入失敗的原因對使用者要講人話，但不要講到能拿來試探系統。 */
const ERRORS: Record<string, string> = {
  state: "登入逾時了，再按一次。",
  token: "跟 Google 換憑證的時候失敗了，再試一次。",
  claims: "Google 回傳的身分資料看起來不對，再試一次。",
  blocked: "這個 Google 帳號還沒有權限進來。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  // proxy 踢人過來時會帶上原本要去的地方，登入完再送回去。
  const href = next?.startsWith("/") && !next.startsWith("//")
    ? `/auth/google?next=${encodeURIComponent(next)}`
    : "/auth/google";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <div className="receipt bg-white px-6 py-8 text-center shadow-xl">
        <h1 className="font-mono text-lg font-bold tracking-[0.3em]">築巢收據</h1>
        <p className="font-mono text-[11px] tracking-[0.2em] text-stone-500">NESTING RECEIPTS</p>
        <hr className="my-4 border-0 border-t border-dashed border-stone-400" />

        {/*
          用 <a> 不用 <Link>：/auth/google 是 route handler 不是頁面，
          Link 會先試著抓 RSC payload、失敗、再退回一般導向——
          每次登入都多一個失敗的 fetch。這裡本來就是要整頁離開。
        */}
        <a
          href={href}
          className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-3 font-medium shadow-sm transition hover:bg-stone-50 active:scale-[0.99]"
        >
          <GoogleMark />
          用 Google 登入
        </a>

        {error && (
          <p className="mt-3 text-sm text-red-600">{ERRORS[error] ?? "登入沒成功，再試一次。"}</p>
        )}
      </div>
    </main>
  );
}

/** Google 的四色 G。內嵌 SVG——為了一個圖示裝一包 icon library 不划算。 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
