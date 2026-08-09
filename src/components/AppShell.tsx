import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import ProfileMenu from "./ProfileMenu";

export default function AppShell({
  title,
  email,
  children,
}: {
  title?: string;
  email: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-secondary/10">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-text/10 bg-background px-6 shadow-sm">
          {title ? (
            <h1 className="text-lg font-semibold text-text">{title}</h1>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ProfileMenu email={email} />
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
