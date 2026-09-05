import { login } from "./actions.ts";
import { SubmitButton } from "../ui.tsx";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <div className="receipt bg-white px-6 py-8 text-center shadow-xl">
        <h1 className="font-mono text-lg font-bold tracking-[0.3em]">新家帳本</h1>
        <p className="font-mono text-[11px] tracking-[0.2em] text-stone-500">HOME LEDGER</p>
        <hr className="my-4 border-0 border-t border-dashed border-stone-400" />
        <form action={login} className="flex flex-col gap-3">
          <input
            type="password"
            name="password"
            autoFocus
            required
            placeholder="密碼"
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center outline-none focus:border-stone-400 focus:bg-white"
          />
          <SubmitButton className="rounded-xl bg-stone-900 px-3 py-2 font-medium text-white transition active:scale-[0.99]">
            開機
          </SubmitButton>
          {error && <p className="text-sm text-red-600">密碼不對。</p>}
        </form>
      </div>
    </main>
  );
}
