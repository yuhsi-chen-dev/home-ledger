import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "新家帳本",
  description: "裝潢到入住的支出記錄與分帳。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-dvh bg-stone-100 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
