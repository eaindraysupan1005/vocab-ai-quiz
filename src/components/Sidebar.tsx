"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/learn",
    label: "Learn",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/quiz",
    label: "Quiz",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative z-10 flex w-20 shrink-0 flex-col items-center gap-6 border-r border-text/10 bg-background py-5 shadow-[2px_0_10px_-4px_rgba(0,0,0,0.12)]">
      <Link
        href="/"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-[#0f1704] shadow-sm"
      >
        V
      </Link>

      <nav className="flex flex-col items-stretch gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-text/60 hover:bg-text/5 hover:text-text"
              }`}
            >
              {active && (
                <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary" />
              )}
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
