import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "建立帳號 | 心聆日記" };

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
