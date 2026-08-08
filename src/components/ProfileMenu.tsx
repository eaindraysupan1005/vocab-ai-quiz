"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";

export default function ProfileMenu({ email }: { email: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = email?.trim()?.[0]?.toUpperCase() ?? "?";

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/40 text-sm font-semibold text-text transition-colors hover:bg-secondary/60"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-10 w-56 rounded-lg border border-text/10 bg-background py-2 shadow-lg">
          <p className="truncate px-4 py-1.5 text-sm text-text/70">{email}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full px-4 py-1.5 text-left text-sm font-medium text-text hover:bg-text/5"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
