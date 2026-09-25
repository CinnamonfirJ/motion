import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChatMessageDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useSession } from "../state/session";
import { Avatar } from "./ui";

/**
 * Live text chat — ENNOIA's sharp/mono language, works on the dark Live surface.
 * Behaviour: history load → realtime append; auto-scroll unless the reader has scrolled up
 * (then a "new messages" pill appears); host/author delete; empty/rate-limit/error states.
 * Reactions remain the reward-bearing signal; chat is the room conversation.
 */
export function LiveChat({ streamId, isHost, onlineCount, className = "" }: { streamId: string; isHost: boolean; onlineCount?: number; className?: string }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  // History (once per stream).
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMessages([]);
    api.chatHistory(streamId, undefined, controller.signal)
      .then((r) => { if (active) setMessages(r.messages); })
      .catch(() => { if (active) setError("Couldn't load chat. It'll catch up in a moment."); });
    return () => { active = false; controller.abort(); };
  }, [streamId]);

  // Realtime append / delete.
  useEffect(() => {
    return realtime.on((ev) => {
      if (ev.streamId !== streamId) return;
      if (ev.t === "chat") setMessages((prev) => (prev.some((m) => m.id === ev.message.id) ? prev : [...prev.slice(-199), { ...ev.message, streamId }]));
      else if (ev.t === "chat_deleted") setMessages((prev) => prev.filter((m) => m.id !== ev.messageId));
    });
  }, [streamId]);

  const atBottom = () => {
    const el = scroller.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  // Keep pinned to bottom as messages arrive; otherwise count unread.
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

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try {
      await api.sendChat(streamId, body); // appended via realtime broadcast
      setDraft("");
      setPinnedToBottom(true);
    } catch (e: any) {
      const code = String(e?.message ?? e);
      setError(code === "rate-limited" ? "Slow down a moment — you're chatting fast." : code === "too-long" ? "That message is a little long." : "Message didn't send. Try again in a moment.");
    } finally { setSending(false); }
  };

  const remove = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistic
    try { await api.deleteChat(streamId, id); } catch { setError("Couldn't remove that message."); }
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
            <div key={m.id} className="group flex items-start gap-2">
              <Link to={`/users/${m.author.id}`} className="mt-0.5 shrink-0"><Avatar name={m.author.displayName} url={m.author.avatarUrl} size={22} /></Link>
              <p className="min-w-0 flex-1 break-words text-bodysm text-text-secondary">
                <Link to={`/users/${m.author.id}`} className="font-semibold text-leaf hover:underline">{m.author.displayName}</Link>{" "}
                <span className="text-text">{m.body}</span>
              </p>
              {(isHost || m.author.id === user?.id) && (
                <button onClick={() => void remove(m.id)} aria-label="Remove message" className="shrink-0 px-1 font-mono text-micro text-text-muted opacity-0 transition-opacity hover:text-error group-hover:opacity-100">×</button>
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
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder="Say something…"
              aria-label="Write a message"
              className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-bodysm text-text placeholder:text-text-muted focus:border-borderStrong focus:outline-none"
            />
            <button type="submit" disabled={sending || !draft.trim()} className="shrink-0 bg-brand px-3 py-2 font-mono text-micro uppercase tracking-[0.1em] text-white hover:bg-brandHover disabled:opacity-40">Send</button>
          </form>
        ) : (
          <p className="px-1 py-1 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">Sign in to join the chat.</p>
        )}
      </footer>
    </section>
  );
}
