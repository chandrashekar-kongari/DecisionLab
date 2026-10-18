"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar, type SidebarConnector } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav({ connectors }: { connectors: SidebarConnector[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open menu">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[240px] max-w-[240px] gap-0 bg-sidebar p-0 shadow-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>DecisionLab</SheetDescription>
          </SheetHeader>
          <Sidebar
            className="h-full w-full border-0"
            connectors={connectors}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-medium tracking-tight text-foreground">
        DecisionLab
      </span>
    </header>
  );
}
