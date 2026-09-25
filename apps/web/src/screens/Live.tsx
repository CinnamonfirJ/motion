import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { streamPositionSec, streamTimeMs, newEventId } from "@ennoia/core";
import { api, type StreamDTO, type SyncDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { Avatar, LivePill } from "../components/ui";
import { LivePlayer } from "../components/players";
import { LiveKitStage } from "../components/LiveKitStage";
import { LiveChat } from "../components/LiveChat";
import { useMediaQuery } from "../lib/useMediaQuery";
import {
  ReactionRail,
  LivePulse,
  ReactionWave,
  MomentDetectedOverlay,
  MomentFormingPill,
  CuratorCelebration,
  RewardToast,
  type ReactionType,
} from "../components/live";
import { useSession } from "../state/session";

const chip =
  "inline-flex items-center gap-1.5 border border-border bg-surface2 px-3 py-1.5 font-mono text-micro uppercase tracking-[0.1em] text-text-secondary transition-colors hover:text-text hover:border-borderStrong disabled:opacity-40";

/**
 * Live screen — one orchestrator, two explicit experiences.
 *   • VIEWER: watch-first. Large video + live chat (desktop column / mobile sheet) + the
 *     reaction rail, Tip, Clip, Share and Follow. No broadcaster controls are rendered.
 *   • STREAMER/SPEAKER: LiveKitStage exposes the room + A/V + host management; the host also
 *     gets End live. Broadcaster controls follow the server-authorised role, never a client flag.
 * Desktop lays out [video + engagement | chat]; mobile stacks video over engagement with chat
 * in a bottom sheet so the stream is never fully covered.
 */
export function Live() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [stream, setStream] = useState<StreamDTO | null>(null);
  const [ended, setEnded] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const sync = useRef<SyncDTO | null>(null);
  const [muted, setMuted] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [heatingUp, setHeatingUp] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [forming, setForming] = useState(false);
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const [celebration, setCelebration] = useState<{ rank: number; rewardUsd: string; momentId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wave, setWave] = useState<number[]>([]);
  const { sendTransaction, user } = useSession();

  const isCreator = !!stream?.creator?.id && stream.creator.id === user?.id;

  // Load stream + clock sync.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setStream(null);
    setJoinError(false);
    setEnded(false);
    (async () => {
      void realtime.syncClock().catch(() => {});
      const r = await api.stream(id, controller.signal);
      if (!alive) return;
      setStream(r.stream);
      sync.current = r.sync;
      setViewerCount(r.stream.viewerCount);
      if (!r.stream.isLive) setEnded(true);
    })().catch(() => { if (alive) setJoinError(true); }).finally(() => clearTimeout(timeout));
    realtime.connect();
    realtime.subscribe(id);
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
      realtime.unsubscribe(id);
    };
  }, [id, joinAttempt]);

  // Follow state (viewer) + follower count (host studio stats).
  useEffect(() => {
    const creatorId = stream?.creator?.id;
    if (!creatorId) { setFollowed(null); setFollowerCount(null); return; }
    let alive = true;
    api.userSocial(creatorId).then((s) => {
      if (!alive) return;
      setFollowerCount(s.followers);
      setFollowed(creatorId === user?.id ? null : s.followedByMe);
    }).catch(() => {});
    return () => { alive = false; };
  }, [stream?.creator?.id, user?.id]);

  // Realtime events.
  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.streamId && ev.streamId !== id && ev.t !== "curator" && ev.t !== "settlement") return;
      switch (ev.t) {
        case "activity":
          setHeatingUp(ev.heatingUp);
          setWave((w) => [...w.slice(-23), ev.ratePerSec]);
          break;
        case "viewers":
          setViewerCount(ev.count);
          break;
        case "moment_detected":
          setDetecting(true);
          break;
        case "moment":
          if (ev.state === "CONFIRMED" || ev.state === "CLIPPING" || ev.state === "SETTLING") setForming(true);
          if (ev.state === "PUBLISHED" || ev.state === "SETTLED" || ev.state === "EXPIRED") setForming(false);
          break;
        case "curator":
          setCelebration({ rank: ev.rank, rewardUsd: ev.rewardUsd ?? "$0.00", momentId: ev.momentId });
          break;
        case "settlement":
          if (ev.status === "confirmed") setToast("Reward received");
          break;
        case "live_room":
          // Reflect an ended stream (host ended / grace expired) without a hard reload.
          api.stream(id).then((r) => { setStream(r.stream); if (!r.stream.isLive) setEnded(true); }).catch(() => {});
          break;
      }
    });
    return off;
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const positionSec = () => {
    const s = sync.current;
    if (!s) return 0;
    return streamPositionSec(s.startedAt, s.durationSec, realtime.serverNow());
  };

  const react = async (type: ReactionType) => {
    const s = sync.current;
    const clientStreamTimeMs = s ? streamTimeMs(s.startedAt, realtime.serverNow()) : 0;
    try { await api.react(id, type, clientStreamTimeMs, newEventId()); } catch { /* optimistic */ }
  };

  const share = async () => {
    const url = `${window.location.origin}/live/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: stream?.title ?? "Live on ENNOIA", url });
      else { await navigator.clipboard.writeText(url); setToast("Link copied to share"); }
    } catch { /* user dismissed the share sheet */ }
  };

  const toggleFollow = async () => {
    const creatorId = stream?.creator?.id;
    if (!creatorId || followed === null) return;
    const next = !followed;
    setFollowed(next); // optimistic
    try { if (next) await api.follow(creatorId); else await api.unfollow(creatorId); }
    catch { setFollowed(!next); setToast("Couldn't update follow. Try again in a moment."); }
  };

  const endLive = async () => {
    try { await api.endStream(id); nav("/"); } catch { setToast("Couldn't end the stream. Try again in a moment."); }
  };

  const tip = async () => {
    try { const r = await api.tip(id); await sendTransaction(r.transaction); setToast(`Tip sent · ${r.amountUsd}`); }
    catch { setToast("Your tip needs a moment — still going through."); }
  };
  const clip = async () => {
    try { const s = sync.current; const at = s ? streamTimeMs(s.startedAt, realtime.serverNow()) : 0; await api.clip(id, at); setToast("Clip saved to your finds"); }
    catch { setToast("Your clip's coming together — one moment."); }
  };

  // ---- loading / error / ended ----
  if (!stream) {
    return (
      <div data-theme="dark" className="min-h-[100dvh] grid place-items-center bg-night text-text">
        <div className="text-center">
          {joinError ? (
            <><p className="text-body text-text-secondary">The stream is taking too long to load.</p>
              <button className="mt-4 border border-lime px-4 py-2 font-mono text-micro uppercase tracking-[0.1em] text-lime" onClick={() => setJoinAttempt((a) => a + 1)}>Retry joining</button></>
          ) : (
            <><div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-lime border-t-transparent animate-spin" /><p className="text-body text-text-secondary">Joining live…</p></>
          )}
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div data-theme="dark" className="min-h-[100dvh] grid place-items-center bg-night text-text">
        <div className="max-w-sm text-center">
          <LivePill />
          <h1 className="mt-4 text-h2">This stream has ended</h1>
          <p className="mt-2 text-bodysm text-text-secondary">{stream.creator?.displayName ?? "The host"} isn't live right now. Catch the Moments they made, or head back to the feed.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button className={chip} onClick={() => nav("/moments")}>View Moments</button>
            <button className={chip} onClick={() => nav("/")}>Back to feed</button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop host of a LiveKit stream → the full studio (reference layout, ENNOIA sharp style).
  // Mobile host + all viewers keep the stacked watch-first layout below.
  const studioMode = isCreator && stream.mode === "livekit" && wide;
  if (studioMode) {
    return (
      <div data-theme="dark" className="h-[100dvh] bg-night text-text">
        <LiveKitStage streamId={stream.id} hostId={stream.creator?.id ?? ""} stream={stream} viewerCount={viewerCount} followerCount={followerCount} onEnd={() => void endLive()} />
        {detecting && <MomentDetectedOverlay onDone={() => { setDetecting(false); setForming(true); }} />}
        {toast && <RewardToast text={toast} />}
      </div>
    );
  }

  const videoNode = stream.mode === "livekit"
    ? <LiveKitStage streamId={stream.id} hostId={stream.creator?.id ?? ""} />
    : <LivePlayer src={stream.videoUrl} getPositionSec={positionSec} muted={muted} onToggleMute={() => setMuted((m) => !m)} />;

  return (
    <div data-theme="dark" className="min-h-[100dvh] bg-night text-text">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col lg:h-[100dvh] lg:flex-row">
        {/* ---- MAIN column: video + engagement ---- */}
        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="relative w-full shrink-0 bg-black lg:min-h-0 lg:flex-1" style={{ height: "clamp(220px, 42vh, 560px)" }}>
            <div className="absolute inset-0 lg:static lg:h-full">{videoNode}</div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />

            {/* top overlays — kept minimal so they don't compete with the stream */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3 lg:p-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
              <div className="pointer-events-auto flex items-center gap-2">
                <button onClick={() => nav(-1)} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-text backdrop-blur">←</button>
                <span className="flex items-center gap-2 rounded-full bg-black/45 px-2.5 py-1 backdrop-blur">
                  <Avatar name={stream.creator?.displayName ?? "?"} url={stream.creator?.avatarUrl} size={24} />
                  <span className="text-label text-text">{stream.creator?.displayName}</span>
                </span>
              </div>
              <div className="pointer-events-auto"><LivePill count={viewerCount} /></div>
            </div>

            {forming && !detecting && <div className="absolute left-1/2 top-16 -translate-x-1/2"><MomentFormingPill /></div>}
            {detecting && <MomentDetectedOverlay onDone={() => { setDetecting(false); setForming(true); }} />}
          </div>

          {/* below-video: creator meta + engagement (reference viewer structure, sharp style) */}
          <div className="flex flex-col gap-4 overflow-y-auto border-t border-border bg-surface1 p-4 lg:shrink-0 lg:p-5" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {/* meta row: creator + title on the left, Share/Follow on the right */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={stream.creator?.displayName ?? "?"} url={stream.creator?.avatarUrl} size={44} />
                <div className="min-w-0">
                  <h1 className="truncate text-h3 text-text">{stream.title}</h1>
                  <p className="mt-1 flex items-center gap-2 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">
                    <span className="text-text-secondary">{stream.creator?.displayName}</span>
                    <span className="h-1 w-1 rounded-full bg-text-muted" aria-hidden />
                    {viewerCount} watching
                  </p>
                  {isCreator && stream.mode === "livekit" && stream.recording === false && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-micro uppercase tracking-[0.1em] text-warning" role="status">
                      <span aria-hidden>⦿</span> Not recording · clips won't save this stream
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className={chip} onClick={() => void share()}>↗ Share</button>
                {isCreator ? (
                  <button className="inline-flex items-center gap-1.5 border border-error/60 bg-error/10 px-3 py-1.5 font-mono text-micro uppercase tracking-[0.1em] text-error hover:bg-error/20" onClick={() => void endLive()}>■ End live</button>
                ) : followed !== null ? (
                  <button className={followed ? chip : "inline-flex items-center gap-1.5 bg-brand px-3 py-1.5 font-mono text-micro uppercase tracking-[0.1em] text-white hover:bg-brandHover"} onClick={() => void toggleFollow()}>
                    {followed ? "Following ✓" : "+ Follow"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* engagement strip: reactions (ENNOIA's core signal) + Tip / Clip */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-border bg-surface2 p-3">
              <div className="flex items-center gap-4">
                <ReactionRail onReact={react} />
                <div className="hidden sm:block"><LivePulse heatingUp={heatingUp} /></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void tip()} className={chip}>♥ Tip</button>
                <button onClick={() => void clip()} className={chip}>✂ Clip</button>
                <button onClick={() => setChatOpen(true)} className={`${chip} lg:hidden`} aria-label="Open live chat">💬 Chat</button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <ReactionWave data={wave} heatingUp={heatingUp} />
              <p className="font-mono text-micro text-text-muted">Tap or press 1 · 2 · 3</p>
            </div>
          </div>
        </div>

        {/* ---- CHAT column (desktop) ---- */}
        <aside className="hidden w-[360px] shrink-0 lg:flex lg:min-h-0">
          <LiveChat streamId={id} isHost={isCreator} onlineCount={viewerCount} className="flex-1 border-l border-t-0" />
        </aside>
      </div>

      {/* ---- CHAT sheet (mobile) ---- */}
      {chatOpen && (
        <div className="fixed inset-0 z-40 flex flex-col lg:hidden" role="dialog" aria-label="Live chat" data-theme="dark">
          <button className="flex-1 bg-black/40" aria-label="Close chat" onClick={() => setChatOpen(false)} />
          <div className="h-[62dvh]">
            <LiveChat streamId={id} isHost={isCreator} onlineCount={viewerCount} className="h-full" />
          </div>
        </div>
      )}

      {celebration && (
        <CuratorCelebration
          rank={celebration.rank}
          rewardUsd={celebration.rewardUsd}
          onWatch={() => nav(`/moments/${celebration.momentId}`)}
          onDone={() => setCelebration(null)}
        />
      )}
      {toast && <RewardToast text={toast} />}
    </div>
  );
}
