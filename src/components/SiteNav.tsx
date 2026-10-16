"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, PenLine, Settings } from "lucide-react";

const LINKS = [
  { href: "/", label: "書寫", icon: PenLine },
  { href: "/history", label: "回顧", icon: BookOpen },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <nav aria-label="主選單">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-accent-soft text-ink" : "text-ink-soft hover:bg-surface-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
