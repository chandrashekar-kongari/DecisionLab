"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function ContentFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>;
  }
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:px-8 md:py-10">{children}</div>
    </main>
  );
}
