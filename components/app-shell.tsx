import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { ContentFrame } from "@/components/content-frame";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { sidebarConnectors } from "@/lib/data/connections";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Suspense
        fallback={
          <div className="hidden w-[200px] shrink-0 border-r border-sidebar-border bg-sidebar md:block lg:w-60" />
        }
      >
        <DesktopSidebar />
      </Suspense>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense
          fallback={<div className="h-12 border-b border-border md:hidden" />}
        >
          <MobileSidebar />
        </Suspense>
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:px-8 md:py-10" />
          }
        >
          <ContentFrame>{children}</ContentFrame>
        </Suspense>
      </div>
    </div>
  );
}

async function DesktopSidebar() {
  await connection();
  return <Sidebar className="hidden md:flex" connectors={sidebarConnectors()} />;
}

async function MobileSidebar() {
  await connection();
  return <MobileNav connectors={sidebarConnectors()} />;
}
