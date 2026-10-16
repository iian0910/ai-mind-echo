import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import Link from "next/link";
import { Feather } from "lucide-react";
import { DisclaimerGate } from "@/components/DisclaimerGate";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const notoSans = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  weight: ["400", "500", "700"],
  preload: false,
});

const notoSerif = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  weight: ["400", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: "心聆日記 MindEcho",
  description: "寫下今天的心情，讓溫暖的文字陪你一起整理。",
};

// 在首次繪製前從 localStorage 套用主題，避免水合前的閃爍
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="earth"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}else if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant-TW"
      data-theme="light"
      suppressHydrationWarning
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-serif text-lg">
              <Feather className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
              心聆日記
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-ink-soft">
          心聆日記不是醫療或諮商服務。若有立即危險，請撥打 119 或安心專線 1925。
        </footer>
        <DisclaimerGate />
      </body>
    </html>
  );
}
