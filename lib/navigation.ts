import { Bot, Database, FlaskConical, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const primaryNav: NavItem[] = [
  { href: "/", label: "Agent", icon: Bot },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/data", label: "Data Sources", icon: Database },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
