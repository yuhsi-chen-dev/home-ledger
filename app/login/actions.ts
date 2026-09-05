"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, sha256, requirePassword } from "@/lib/auth.ts";

export async function login(formData: FormData) {
  const input = String(formData.get("password") ?? "");
  const expected = await sha256(requirePassword());
  // 比對 hash 而不是明文：兩邊等長，時序差異問不出東西。
  if ((await sha256(input)) !== expected) redirect("/login?error=1");

  (await cookies()).set(COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
