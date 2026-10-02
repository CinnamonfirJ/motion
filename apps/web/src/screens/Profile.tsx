import { useEffect, useRef, useState } from "react";
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
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.scoutEarnings().then(setScout).catch(() => {});
  }, []);

  const changeTheme = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  if (!user) return null;
  if (editing) return <EditProfile onClose={() => setEditing(false)} />;
  return (
    <div className="space-y-6 max-w-md">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <Avatar name={user.displayName} url={user.avatarUrl} size={80} />
        <div>
          <h1 className="text-h2">{user.displayName}</h1>
          <p className="text-bodysm text-text-muted">@{user.handle}</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing(true)}>Edit profile</Button>
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

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useSession();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const errorMessage = (code: string) =>
    ({
      "handle-taken": "That handle is already taken.",
      "invalid-handle": "Handle must be 3–20 chars: letters, numbers or underscore.",
      "invalid-display-name": "Name must be 1–40 characters.",
      "invalid-avatar-url": "That image couldn't be used. Try another.",
    } as Record<string, string>)[code] ?? "Couldn't save. Please try again.";

  const pickAvatar = async (file: File) => {
    setError(null);
    if (!AVATAR_TYPES.includes(file.type)) return setError("Use a JPG, PNG or WebP image.");
    if (file.size > 15_000_000) return setError("Image must be under 15 MB.");
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await api.uploadPostMedia(file.type, file.size);
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("upload-failed");
      setAvatarUrl(publicUrl);
    } catch {
      setError("Image upload failed. (If this persists, R2 CORS may need to allow this site.)");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ displayName, handle, avatarUrl });
      onClose();
    } catch (e: any) {
      setError(errorMessage(e?.message));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-surface1 border border-border px-3 py-2 text-body text-text outline-none focus:border-brand";

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center justify-between">
        <h1 className="text-h2">Edit profile</h1>
        <button onClick={onClose} className="font-mono text-micro uppercase tracking-[0.1em] text-text-muted hover:text-text">Cancel</button>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={displayName || user.displayName} url={avatarUrl} size={72} />
        <div className="space-y-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
          {avatarUrl && (
            <button onClick={() => setAvatarUrl(null)} className="block font-mono text-micro uppercase tracking-[0.1em] text-text-muted hover:text-error">Remove photo</button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); e.target.value = ""; }}
          />
        </div>
      </div>

      <label className="block space-y-1">
        <span className="eyebrow text-micro text-text-muted">Display name</span>
        <input className={inputCls} value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
      </label>

      <label className="block space-y-1">
        <span className="eyebrow text-micro text-text-muted">Handle</span>
        <div className="flex items-center border border-border bg-surface1 focus-within:border-brand">
          <span className="pl-3 text-text-muted">@</span>
          <input
            className="w-full bg-transparent px-1 py-2 text-body text-text outline-none"
            value={handle}
            maxLength={20}
            autoCapitalize="none"
            onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
            placeholder="handle"
          />
        </div>
        <span className="block text-micro text-text-muted">3–20 characters · letters, numbers, underscore</span>
      </label>

      {error && <p className="text-bodysm text-error">{error}</p>}

      <div className="flex gap-3">
        <Button className="flex-1" onClick={save} disabled={saving || uploading || !displayName.trim() || handle.length < 3}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
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
