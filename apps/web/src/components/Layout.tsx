import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState, type ComponentType } from "react";
import { useSession } from "../state/session";
import { api } from "../lib/api";
import { Avatar } from "./ui";
import { IconHome, IconSpark, IconBolt, IconUser } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const NAV: { to: string; label: string; Icon: ComponentType<{ size?: number }>; end?: boolean }[] = [
  { to: "/", label: "Home", Icon: IconHome, end: true },
  { to: "/moments", label: "Moments", Icon: IconSpark },
  { to: "/earnings", label: "Earnings", Icon: IconBolt },
  { to: "/profile", label: "Profile", Icon: IconUser },
];

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative h-8 w-8 overflow-hidden" aria-hidden="true">
        <img src="/ennoia-mark.png" alt="" className="absolute left-1/2 top-1/2 h-20 w-20 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain" />
      </span>
      <span className="text-h3 font-bold tracking-[0.08em]">ENNOIA</span>
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const { user } = useSession();
  const [balance, setBalance] = useState<string>("");
  const isLive = location.pathname.startsWith("/live/");

  useEffect(() => {
    api.scoutEarnings().then((e) => setBalance(e.totalUsd)).catch(() => {});
  }, [location.pathname]);

  if (isLive) return <Outlet />;

  return (
    <div className="min-h-screen md:flex">
      {/* Web left rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-border p-5 md:flex">
        <div className="mb-8">
          <Logo />
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 font-mono text-label uppercase tracking-[0.1em] transition-colors duration-quick ${
                isActive ? "bg-surface2 text-leaf" : "text-text-secondary hover:bg-surface1 hover:text-text"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-0 h-full w-[2px] bg-lime" />}
                <n.Icon size={18} />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
        <div className="mt-auto flex items-center gap-3 border border-border bg-surface1 p-3">
          <Avatar name={user?.displayName ?? "You"} url={user?.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-bodysm text-text">{user?.displayName}</p>
            <p className="truncate font-mono text-micro text-text-muted">{balance} earned</p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-night/90 px-4 py-3 backdrop-blur md:hidden"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <Logo />
        <span className="border border-border bg-surface1 px-2.5 py-1 font-mono text-micro uppercase tracking-[0.1em] text-leaf">
          {balance || "$0.00"} earned
        </span>
      </header>

      <main className="min-w-0 flex-1 pb-24 md:pb-8">
        <div className="mx-auto w-full max-w-[820px] px-4 py-4 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-border bg-night/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 font-mono text-micro uppercase tracking-[0.08em] ${
                isActive ? "text-leaf" : "text-text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <n.Icon size={20} />
                {isActive && <span className="h-[2px] w-4 bg-lime" />}
                <span className={isActive ? "" : "mt-[2px]"}>{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
