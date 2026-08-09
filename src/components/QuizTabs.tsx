import Link from "next/link";

export default function QuizTabs({
  active,
  dailyLocked,
}: {
  active: "daily" | "band";
  dailyLocked: boolean;
}) {
  const tabs: { key: "daily" | "band"; href: string; label: string }[] = [
    { key: "daily", href: "/quiz?tab=daily", label: "Daily quiz" },
    { key: "band", href: "/quiz?tab=band", label: "Band level test" },
  ];

  return (
    <div className="flex w-full max-w-3xl gap-2">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-[#0f1704]"
                : "bg-secondary/20 text-text/70 hover:bg-secondary/30"
            }`}
          >
            {tab.label}
            {tab.key === "daily" && dailyLocked && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-label="Locked"
              >
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </Link>
        );
      })}
    </div>
  );
}
