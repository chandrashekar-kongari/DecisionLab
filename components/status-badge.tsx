import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const statusClassName = {
  connected: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-muted-foreground",
} as const;

type StatusBadgeProps = {
  status: keyof typeof statusClassName;
  children: ReactNode;
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", statusClassName[status])}
        aria-hidden
      />
      <span className="truncate">{children}</span>
    </span>
  );
}
