import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { streamPositionSec, streamTimeMs, newEventId } from "@moment/core";
import { api, type StreamDTO, type SyncDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { Avatar, LivePill } from "../components/ui";
import { LivePlayer } from "../components/players";
import {
  ReactionRail,
  LivePulse,
  MomentDetectedOverlay,
  MomentFormingPill,
  CuratorCelebration,
  RewardToast,
  type ReactionType,
} from "../components/live";

export function Live() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [stream, setStream] = useState<StreamDTO | null>(null);
  const sync = useRef<SyncDTO | null>(null);
  const [muted, setMuted] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [heatingUp, setHeatingUp] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [forming, setForming] = useState(false);
  const [celebration, setCelebration] = useState<{ rank: number; rewardUsd: string; momentId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load stream + clock sync.
  useEffect(() => {
    let alive = true;
    (async () => {
      await realtime.syncClock();
      const r = await api.stream(id);
      if (!alive) return;
      setStream(r.stream);
      sync.current = r.sync;
      setViewerCount(r.stream.viewerCount);
    })().catch(() => nav("/"));
    realtime.connect();
    realtime.subscribe(id);
    return () => {
      alive = false;
      realtime.unsubscribe(id);
    };
  }, [id]);

  // Realtime events.
  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.streamId && ev.streamId !== id && ev.t !== "curator" && ev.t !== "settlement") return;
      switch (ev.t) {
        case "activity":
          setHeatingUp(ev.heatingUp);
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
        case "curator": {
          setCelebration({ rank: ev.rank, rewardUsd: ev.rewardUsd ?? "$0.00", momentId: ev.momentId });
          break;
        }
        case "settlement":
          if (ev.status === "confirmed") setToast("Reward received");
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
    try {
      await api.react(id, type, clientStreamTimeMs, newEventId());
    } catch {
      /* reaction feedback already shown optimistically */
    }
  };

  if (!stream) {
    return (
      <div className="min-h-screen grid place-items-center bg-night">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-lime border-t-transparent animate-spin" />
          <p className="text-body text-text-secondary">Joining live…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night flex flex-col">
      {/* video region (~65-72% on mobile) */}
      <div className="relative w-full bg-black" style={{ height: "min(72vh, 720px)" }}>
        <LivePlayer src={stream.videoUrl} getPositionSec={positionSec} muted={muted} onToggleMute={() => setMuted((m) => !m)} />

        {/* top overlays */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => nav(-1)} aria-label="Back" className="h-10 w-10 rounded-full bg-black/50 backdrop-blur grid place-items-center text-text">
              ←
            </button>
            <span className="flex items-center gap-2 rounded-full bg-black/45 backdrop-blur px-2.5 py-1">
              <Avatar name={stream.creator?.displayName ?? "?"} url={stream.creator?.avatarUrl} size={26} />
              <span className="text-label text-text">{stream.creator?.displayName}</span>
            </span>
          </div>
          <LivePill count={viewerCount} />
        </div>

        {/* forming pill */}
        {forming && !detecting && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2">
            <MomentFormingPill />
          </div>
        )}

        {detecting && <MomentDetectedOverlay onDone={() => { setDetecting(false); setForming(true); }} />}
      </div>

      {/* reaction region */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <LivePulse heatingUp={heatingUp} />
        <ReactionRail onReact={react} />
        <p className="text-micro text-text-muted">Tap to react · keys 1 · 2 · 3</p>
      </div>

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
