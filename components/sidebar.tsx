"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, primaryNav, secondaryNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export type SidebarConnector = {
  id: "stripe" | "supabase";
  label: string;
  connected: boolean;
};

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
  connectors?: SidebarConnector[];
};

export function Sidebar({ className, onNavigate, connectors = [] }: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:w-[200px] lg:w-60",
        className,
      )}
    >
      <div className="px-3 pt-4 pb-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-foreground transition-colors duration-150 hover:bg-muted"
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-primary text-2xs font-medium text-primary-foreground">
            D
          </span>
          <span className="text-sm font-medium tracking-tight">DecisionLab</span>
        </Link>
      </div>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Primary">
        {primaryNav.map((item) => (
          <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto px-3 pb-3">
        {connectors.length > 0 ? (
          <div className="mb-3">
            <p className="px-2 pb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              Connectors
            </p>
            <ul className="flex flex-col gap-0.5">
              {connectors.map((connector) => (
                <li key={connector.id}>
                  <ConnectorRow connector={connector} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Separator className="mb-2" />
        <nav className="flex flex-col gap-0.5" aria-label="Secondary">
          {secondaryNav.map((item) => (
            <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>
    </aside>
  );
}

function ConnectorRow({
  connector,
  onNavigate,
}: {
  connector: SidebarConnector;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/connections"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      <ConnectorMark id={connector.id} />
      <span className="min-w-0">
        <span className="block truncate text-ui">{connector.label}</span>
        <span
          className={cn(
            "block text-2xs",
            connector.connected ? "text-success" : "text-muted-foreground",
          )}
        >
          {connector.connected ? "Connected" : "Not connected"}
        </span>
      </span>
    </Link>
  );
}

function ConnectorMark({ id }: { id: SidebarConnector["id"] }) {
  const stripe = id === "stripe";
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white",
        stripe ? "bg-[#635bff]" : "bg-[#3ecf8e] text-[#1c1c1c]",
      )}
      aria-hidden
    >
      {stripe ? "S" : "Sb"}
    </span>
  );
}

function SidebarLink({
  item,
  onNavigate,
}: {
  item: (typeof primaryNav)[number];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-ui text-sidebar-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {item.label}
    </Link>
  );
}
