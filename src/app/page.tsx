import { DiaryComposer } from "@/components/DiaryComposer";
import { RequireUser } from "@/components/RequireUser";

export default function Home() {
  return (
    <RequireUser from="/">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <h1 className="font-serif text-3xl tracking-wide">今天，想說些什麼？</h1>
          <p className="mt-2 text-ink-soft leading-relaxed">
            寫下來就好。寄出後，會有一封溫暖的回信陪你一起整理心情。
          </p>
        </header>
        <DiaryComposer />
      </div>
    </RequireUser>
  );
}
