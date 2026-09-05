"use client";

import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";

const ring =
  "ml-1 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]";

/**
 * 按下去到畫面換掉之間會等伺服器，沒有回饋會讓人以為沒按到。
 * 這兩個是全站唯一的 client component，只為了「按了有反應」。
 */
export function LinkSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <span className={ring} aria-hidden /> : null;
}

export function SubmitButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} ${pending ? "cursor-wait opacity-60" : ""}`}>
      {children}
      {pending && <span className={ring} aria-hidden />}
    </button>
  );
}
