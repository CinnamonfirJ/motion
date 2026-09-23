import { useEffect, useState } from "react";
import { useSession } from "../state/session";
import { api } from "../lib/api";
import { Avatar, Card, Button } from "../components/ui";
import { shortAddr } from "../lib/format";
import { getTheme, setTheme, type Theme } from "../lib/theme";

export function Profile() {
  const { user, logout } = useSession();
  const [scout, setScout] = useState<any>(null);
  const [showWallet, setShowWallet] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme());

  useEffect(() => {
    api.scoutEarnings().then(setScout).catch(() => {});
  }, []);

  const changeTheme = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  if (!user) return null;
  return (
    <div className="space-y-6 max-w-md">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <Avatar name={user.displayName} url={user.avatarUrl} size={80} />
        <div>
          <h1 className="text-h2">{user.displayName}</h1>
          <p className="text-bodysm text-text-muted">@{user.handle}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Found" value={scout?.momentsCurated ?? 0} />
        <Stat label="First finds" value={scout?.firstFinds ?? 0} />
        <Stat label="Earned" value={scout?.totalUsd ?? "$0"} />
      </div>

      <Card className="divide-y divide-border">
        <Row label="Account" onClick={() => setShowWallet((v) => !v)} value={showWallet ? "Hide" : "Onchain account"} />
        {showWallet && (
          <div className="p-4 bg-surface2 text-bodysm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Network</span>
              <span className="text-text-secondary">Monad</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Wallet</span>
              <span className="text-text-secondary tabular-nums">{shortAddr(user.walletAddress)}</span>
            </div>
            <p className="text-micro text-text-muted pt-1">Created automatically. No seed phrase needed.</p>
          </div>
        )}
        <Row label="Notifications" value="On" />
        <div className="flex items-center justify-between p-4 min-h-[44px]">
          <span className="text-body">Appearance</span>
          <div className="flex border border-border">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                aria-pressed={theme === t}
                className={`px-3 py-1 font-mono text-micro uppercase tracking-[0.1em] ${
                  theme === t ? "bg-brand text-white" : "bg-surface1 text-text-secondary hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Row label="Help" value="→" />
      </Card>

      <Button variant="secondary" className="w-full" onClick={logout}>
        Sign out
      </Button>
      <button
        className="w-full py-3 text-bodysm text-error"
        onClick={async () => {
          if (!window.confirm("Delete your ENNOIA account? This deletes your Privy login and anonymizes offchain activity. Public Monad transactions cannot be erased.")) return;
          await api.deleteAccount();
          await logout();
        }}
      >
        Delete account
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-h3 tabular-nums">{value}</p>
      <p className="eyebrow text-micro text-text-muted mt-0.5">{label}</p>
    </Card>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between p-4 text-left min-h-[44px] hover:bg-surface2 transition-colors">
      <span className="text-body">{label}</span>
      <span className="text-bodysm text-text-muted">{value}</span>
    </button>
  );
}
