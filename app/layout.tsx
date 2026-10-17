import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DecisionLab",
  description: "Turn business goals into executable experiments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
