import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChatMessageDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useSession } from "../state/session";
import { Avatar } from "./ui";

type ChatMsg = ChatMessageDTO & { clientId?: string; pending?: boolean; failed?: boolean };

const newClientId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);

/**
 * Live text chat — ENNOIA's sharp/mono language.
 * Realtime path: optimistic local echo (<100ms) → POST with a clientId → server broadcasts the
 * canonical message over the WebSocket → we reconcile by clientId (dedup). Persistence is async on
 * the server, so a slow DB write never delays delivery. On reconnect we re-sync history so nothing
 * is lost and nothing duplicates.
 */
export function LiveChat({ streamId, isHost, onlineCount, className = "" }: { streamId: string; isHost: boolean; onlineCount?: number; className?: string }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  /** Merge server history with local state, de-duplicating by server id and keeping pending sends. */
  const mergeHistory = useCallback((history: ChatMessageDTO[]) => {
    setMessages((prev) => {
      const pending = prev.filter((m) => m.pending || m.failed);
      const byId = new Set(history.map((m) => m.id));
      const keptPending = pending.filter((p) => !history.some((h) => h.id === p.id));
      const merged = [...history.filter((m) => byId.has(m.id)), ...keptPending];
      return merged;
    });
  }, []);

  // Initial history + re-sync on (re)connect (server sends `hello` on every connect).
  useEffect(() => {
    let active = true;
    const load = () => api.chatHistory(streamId).then((r) => { if (active) mergeHistory(r.messages); }).catch(() => { if (active) setError("Couldn't load chat. It'll catch up in a moment."); });
    void load();
    const off = realtime.on((ev: any) => { if (ev?.t === "hello") void load(); });
    return () => { active = false; off(); };
  }, [streamId, mergeHistory]);

  // Realtime append / reconcile / delete.
  useEffect(() => {
    return realtime.on((ev: any) => {
      if (ev?.t === "chat" && ev.streamId === streamId) {
        if (import.meta.env.DEV && ev.serverBroadcastAt) console.debug(`[chat] delivery ${Date.now() - ev.serverBroadcastAt}ms (broadcast→receive)`);
        setMessages((prev) => {
          if (prev.some((m) => m.id === ev.message.id)) return prev; // already have canonical
          const cid = ev.message.clientId as string | undefined;
          if (cid) {
            const idx = prev.findIndex((m) => m.clientId === cid);
            if (idx >= 0) { const next = prev.slice(); next[idx] = { ...ev.message, streamId }; return next; } // reconcile optimistic
          }
          return [...prev.slice(-199), { ...ev.message, streamId }];
        });
      } else if (ev?.t === "chat_deleted" && ev.streamId === streamId) {
        setMessages((prev) => prev.filter((m) => m.id !== ev.messageId));
      }
    });
  }, [streamId]);

  const atBottom = () => {
    const el = scroller.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pinnedToBottom) { el.scrollTop = el.scrollHeight; setUnread(0); }
    else setUnread((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const onScroll = useCallback(() => {
    const bottom = atBottom();
    setPinnedToBottom(bottom);
    if (bottom) setUnread(0);
  }, []);

  const jumpToLatest = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinnedToBottom(true);
    setUnread(0);
  };

  const deliver = useCallback(async (clientId: string, body: string) => {
    if (!user) return;
    setError(null);
    try {
      await api.sendChat(streamId, body, clientId); // canonical arrives via broadcast → reconciles
    } catch (e: any) {
      const code = String(e?.message ?? e);
      if (code === "rate-limited") setError("Slow down a moment — you're chatting fast.");
      else if (code === "too-long") setError("That message is a little long.");
      else setError("Message couldn't send. Retry.");
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
    }
  }, [streamId, user]);

  const send = () => {
    const body = draft.trim();
    if (!body || !user) return;
    const clientId = newClientId();
    const optimistic: ChatMsg = { id: clientId, clientId, streamId, body, createdAt: Date.now(), pending: true, author: { id: user.id, displayName: user.displayName, handle: user.handle, avatarUrl: user.avatarUrl } };
    setMessages((prev) => [...prev.slice(-199), optimistic]); // <100ms local echo
    setDraft("");
    setPinnedToBottom(true);
    void deliver(clientId, body);
  };

  const retry = (m: ChatMsg) => {
    setMessages((prev) => prev.map((x) => (x.clientId === m.clientId ? { ...x, pending: true, failed: false } : x)));
    void deliver(m.clientId!, m.body);
  };

  const remove = async (m: ChatMsg) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id)); // optimistic removal
    if (m.pending || m.failed) return; // never persisted server-side
    try { await api.deleteChat(streamId, m.id); } catch { setError("Couldn't remove that message."); }
  };

  return (
    <section className={`flex min-h-0 flex-col border border-border bg-surface1 ${className}`} aria-label="Live chat">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="font-mono text-micro uppercase tracking-[0.14em] text-text">Live chat</h2>
        {typeof onlineCount === "number" && <span className="font-mono text-micro uppercase tracking-[0.1em] text-text-muted">{onlineCount} watching</span>}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="absolute inset-0 space-y-2 overflow-y-auto px-3 py-3" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && <p className="mt-6 text-center font-mono text-micro uppercase tracking-[0.1em] text-text-muted">No messages yet — say hello.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`group flex items-start gap-2 ${m.pending ? "opacity-60" : ""}`}>
              <Link to={`/users/${m.author.id}`} className="mt-0.5 shrink-0"><Avatar name={m.author.displayName} url={m.author.avatarUrl} size={22} /></Link>
              <p className="min-w-0 flex-1 break-words text-bodysm text-text-secondary">
                <Link to={`/users/${m.author.id}`} className="font-semibold text-leaf hover:underline">{m.author.displayName}</Link>{" "}
                <span className="text-text">{m.body}</span>
                {m.failed && <button onClick={() => retry(m)} className="ml-2 font-mono text-micro uppercase tracking-[0.1em] text-error hover:underline">Failed · Retry</button>}
              </p>
              {(isHost || m.author.id === user?.id) && (
                <button onClick={() => void remove(m)} aria-label="Remove message" className="shrink-0 px-1 font-mono text-micro text-text-muted opacity-0 transition-opacity hover:text-error group-hover:opacity-100">×</button>
              )}
            </div>
          ))}
        </div>
        {!pinnedToBottom && unread > 0 && (
          <button onClick={jumpToLatest} className="absolute bottom-2 left-1/2 -translate-x-1/2 border border-border bg-surface2 px-3 py-1 font-mono text-micro uppercase tracking-[0.1em] text-leaf hover:border-borderStrong">
            ↓ {unread} new
          </button>
        )}
      </div>

      <footer className="border-t border-border p-2">
        {error && <p role="alert" className="mb-1 px-1 text-micro text-error">{error}</p>}
        {user ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder="Say something…"
              aria-label="Write a message"
              className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-bodysm text-text placeholder:text-text-muted focus:border-borderStrong focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim()} className="shrink-0 bg-brand px-3 py-2 font-mono text-micro uppercase tracking-[0.1em] text-white hover:bg-brandHover disabled:opacity-40">Send</button>
          </form>
        ) : (
          <p className="px-1 py-1 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">Sign in to join the chat.</p>
        )}
      </footer>
    </section>
  );
}
