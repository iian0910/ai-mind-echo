"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? "登出中……" : "登出"}
    </button>
  );
}
