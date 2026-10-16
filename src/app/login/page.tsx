import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "登入 | 心聆日記" };

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
