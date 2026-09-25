import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useLocalParticipant, useLocalParticipantPermissions, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { api, type LiveRoomDTO, type StreamDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LiveChat } from "./LiveChat";
import { Avatar } from "./ui";

type Role = "host" | "speaker" | "viewer";
interface Credentials { url: string; token: string; role: Role }
interface StudioMeta { stream?: StreamDTO; viewerCount?: number; followerCount?: number | null; onEnd?: () => void }

const control = "border border-border bg-surface2 px-3 py-2 font-mono text-micro uppercase tracking-[0.1em] text-text hover:border-borderStrong disabled:opacity-40";
const primary = "flex-1 border border-border bg-surface2 px-3 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-text hover:border-borderStrong disabled:opacity-40";

function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

// ---- pixel-1:1 studio (reference image) — purple/rounded, theme-aware ----
// Style tokens reproducing the mockup's soft rounded cards + purple gradients.
const S = {
  card: "rounded-2xl border border-border bg-surface1 shadow-[0_1px_2px_rgba(80,40,220,0.04),0_8px_24px_-12px_rgba(80,40,220,0.10)]",
  purple: "rounded-xl bg-gradient-to-r from-[#5028dc] to-[#7c53e6] text-white shadow-[0_6px_16px_-6px_rgba(80,40,220,0.6)] transition hover:brightness-[1.06] active:brightness-95",
  chip: "inline-flex items-center rounded-full bg-[#8c64ff]/12 px-2.5 py-1 text-[11px] font-semibold text-[#5028dc]",
  soft: "rounded-xl border border-border bg-surface2/60 transition hover:border-borderStrong",
};
const badge = "grid h-9 w-9 place-items-center rounded-xl bg-[#8c64ff]/12 text-[#5028dc]";

function Ic({ children, className = "h-[18px] w-[18px]" }: { children: ReactNode; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{children}</svg>;
}
const I = {
  mic: <Ic><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></Ic>,
  micOff: <Ic><path d="m2 2 20 20M9 9v2a3 3 0 0 0 5 2M15 9.3V5a3 3 0 0 0-5.6-1.5" /><path d="M19 10v1a7 7 0 0 1-1.9 4.8M12 18v4" /></Ic>,
  cam: <Ic><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></Ic>,
  screen: <Ic><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></Ic>,
  invite: <Ic><path d="M15 20a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" /></Ic>,
  more: <Ic><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Ic>,
  broadcast: <Ic><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" /></Ic>,
  eye: <Ic className="h-4 w-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Ic>,
  shield: <Ic><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></Ic>,
  gear: <Ic><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a1.6 1.6 0 0 0-1-1.5H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.6 8a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.6 1.6 1.6 0 0 0 10 2.1V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></Ic>,
  chart: <Ic><path d="M3 3v18h18M7 15l3-4 3 3 5-7" /></Ic>,
  dollar: <Ic><path d="M12 2v20M17 6a4 4 0 0 0-4-3h-1a4 4 0 0 0 0 8h2a4 4 0 0 1 0 8h-1a4 4 0 0 1-4-3" /></Ic>,
  chevron: <Ic className="h-4 w-4"><path d="m9 6 6 6-6 6" /></Ic>,
  star: <Ic><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" /></Ic>,
  crown: <Ic><path d="M3 7l4 4 5-6 5 6 4-4v11H3V7Z" /></Ic>,
  search: <Ic><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></Ic>,
  bell: <Ic><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></Ic>,
  chatIcon: <Ic><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10Z" /></Ic>,
  gamepad: <Ic><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" /><rect x="2" y="6" width="20" height="12" rx="4" /></Ic>,
  menu: <Ic><path d="M4 6h16M4 12h16M4 18h16" /></Ic>,
  send: <Ic><path d="m22 2-7 20-4-9-9-4 20-7Z" /></Ic>,
  arrowLeft: <Ic className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></Ic>,
  gift: <Ic><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v9h14v-9M12 8S9 3 6.5 4.5 8 8 12 8ZM12 8s3-5 5.5-3.5S16 8 12 8Z" /></Ic>,
  check: <Ic className="h-4 w-4"><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="m8 12 2.5 2.5L16 9" stroke="#fff" /></Ic>,
};

// Presentational demo values for the panels ENNOIA has no backend for (user-approved to match
// the reference image). Marked as a preview; not live data.
const DEMO = {
  watchTime: "284h",
  deltas: { viewers: "+24%", watch: "+18%", followers: "+12%" },
  goalLabel: "Reach 15K followers",
  latestFollower: "xaze4Life",
  latestFollowerAgo: "2m ago",
  topSupporter: "Papii1420",
  topSupporterAmount: "$50.00",
  cheersUser: "lunaLunarserver",
  cheersAmount: "500 bits",
  bans: [
    { name: "ToxicPlayer123", meta: "Banned · 1h ago", action: "Unban" },
    { name: "RageQuitter", meta: "Banned · 2h ago", action: "Unban" },
    { name: "SpammerGuy", meta: "Timed out · 30m ago", action: "Remove Timeout" },
    { name: "ClownFiesta", meta: "Banned · 3h ago", action: "Unban" },
  ],
};

function RoomStage({ streamId, hostId, initialRole, stream, viewerCount, followerCount, onEnd }: { streamId: string; hostId: string; initialRole: Role } & StudioMeta) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const localPermissions = useLocalParticipantPermissions();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const micTracks = useTracks([Track.Source.Microphone]);
  const [state, setState] = useState<LiveRoomDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const wide = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    try { setState(await api.liveRoom(streamId)); setError((current) => current === "Room controls could not refresh. Retrying…" ? null : current); }
    catch { setError("Room controls could not refresh. Retrying…"); }
  }, [streamId]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    const off = realtime.on((event) => { if (event.t === "live_room" && event.streamId === streamId) void refresh(); });
    return () => { clearInterval(timer); off(); };
  }, [refresh, streamId]);

  const act = async (action: () => Promise<unknown>, device = "Microphone") => {
    if (pending) return;
    setPending(true); setError(null);
    try { await action(); await refresh(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "That action did not work. Try again.";
      setError(/permission denied|notallowed/i.test(message)
        ? `${device} access was denied. Allow it in your browser's site settings, then try again.`
        : message);
    }
    finally { setPending(false); }
  };

  const role = state?.role ?? initialRole;
  const isHost = role === "host";
  const isSpeaker = role === "speaker";
  const canCamera = isHost || (isSpeaker && !!state?.mySpeaker?.canCamera);
  const canScreen = isHost || (isSpeaker && !!state?.mySpeaker?.canScreenShare);
  const speakerPermissionReady = !isSpeaker || !!localPermissions?.canPublish;
  const micLiveFor = (id: string) => micTracks.some((item) => isTrackReference(item) && item.participant.identity === id && !item.publication.isMuted);
  const cameraLiveFor = (id: string) => tracks.some((item) => isTrackReference(item) && item.participant.identity === id && item.source === Track.Source.Camera && !item.publication.isMuted);
  const main = tracks.find((item) => isTrackReference(item) && item.participant.identity === hostId && item.source === Track.Source.ScreenShare)
    ?? tracks.find((item) => isTrackReference(item) && item.participant.identity === hostId && item.source === Track.Source.Camera);
  const side = tracks.filter((item) => isTrackReference(item) && item !== main);
  const nameOf = (id: string) => participants.find((person) => person.identity === id)?.name || id;
  const hostInRoom = participants.some((person) => person.identity === hostId);
  const requested = state?.speakers.filter((speaker) => speaker.status === "requested") ?? [];
  const approved = state?.speakers.filter((speaker) => speaker.status === "approved") ?? [];
  const invited = state?.speakers.filter((speaker) => speaker.status === "invited") ?? [];

  // ---- shared building blocks ----
  const videoSurface = (
    <div className="relative h-full min-h-0 w-full bg-black">
      {main && isTrackReference(main) ? <VideoTrack trackRef={main} className="h-full w-full object-contain" /> : (
        <div className="grid h-full place-items-center text-center text-text-secondary"><div><p className="font-mono text-micro uppercase tracking-[0.14em] text-lime">{hostInRoom || state?.hostConnected ? "Camera off" : "Host connecting"}</p><p className="mt-2 text-body">{nameOf(hostId)}</p></div></div>
      )}
      {state?.hostDisconnectedAt && state.isLive && !state.hostConnected && !hostInRoom && <p className="absolute bottom-4 left-4 border border-warning bg-black/75 px-3 py-2 font-mono text-micro uppercase text-warning">Host reconnecting · five-minute grace</p>}
      {side.length > 0 && <div className="absolute bottom-4 right-4 flex max-w-[60%] gap-2 overflow-x-auto">{side.map((item) => isTrackReference(item) && <div key={`${item.participant.identity}:${item.source}`} className="h-20 w-28 shrink-0 border border-border bg-surface1"><VideoTrack trackRef={item} className="h-full w-full object-cover" /></div>)}</div>}
    </div>
  );

  // PRIMARY A/V controls (host + speaker). Same handlers as before.
  const avControls = (isHost || isSpeaker) && (
    <div className="flex flex-wrap items-center gap-2">
      <button className={primary} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}>{isMicrophoneEnabled ? "Mute mic" : "Enable mic"}</button>
      {canCamera && <button className={primary} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setCameraEnabled(!isCameraEnabled), "Camera")}>{isCameraEnabled ? "Camera off" : "Camera on"}</button>}
      {canScreen && <button className={primary} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled), "Screen sharing")}>{isScreenShareEnabled ? "Stop sharing" : "Share screen"}</button>}
      {isHost && onEnd && <button className="flex-1 border border-error/60 bg-error/10 px-3 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-error hover:bg-error/20" onClick={onEnd}>■ End</button>}
    </div>
  );

  // Host MODERATION sections (mic requests / invite / speakers) — same handlers as before.
  const hostSections = isHost && state ? (
    <div className="space-y-4">
      <section>
        <h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Mic requests · {requested.length}</h3>
        {requested.length === 0 && <p className="mt-2 text-bodysm text-text-muted">No requests yet.</p>}
        {requested.map((speaker) => <div key={speaker.userId} className="mt-2 flex items-center justify-between gap-2 border border-border p-2"><span className="truncate text-bodysm">{nameOf(speaker.userId)}</span><button className={control} disabled={pending} onClick={() => void act(() => api.approveSpeaker(streamId, speaker.userId))}>Allow mic</button></div>)}
      </section>
      <section>
        <h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Invite viewers</h3>
        {participants.filter((person) => person.identity !== hostId && !state.speakers.some((speaker) => speaker.userId === person.identity)).map((person) => <div key={person.identity} className="mt-2 flex items-center justify-between gap-2 border border-border p-2"><span className="truncate text-bodysm">{person.name || person.identity}</span><button className={control} disabled={pending} onClick={() => void act(() => api.inviteSpeaker(streamId, person.identity))}>Invite</button></div>)}
        {invited.map((speaker) => <p key={speaker.userId} className="mt-2 text-bodysm text-text-muted">Invite pending · {nameOf(speaker.userId)}</p>)}
      </section>
      <section>
        <h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Speakers · {approved.length}</h3>
        {approved.map((speaker) => <div key={speaker.userId} className="mt-2 space-y-2 border border-border p-2"><p className="truncate text-bodysm">{nameOf(speaker.userId)}</p><p className="font-mono text-micro uppercase text-text-secondary">{!participants.some((person) => person.identity === speaker.userId) ? "Not in room" : `Mic ${micLiveFor(speaker.userId) ? "live" : "off"} · Camera ${cameraLiveFor(speaker.userId) ? "live" : "off"}`}</p><div className="flex flex-wrap gap-1"><button className={control} disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canCamera: !speaker.canCamera }))}>{speaker.canCamera ? "Disable camera" : "Allow camera"}</button><button className={control} disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canScreenShare: !speaker.canScreenShare }))}>{speaker.canScreenShare ? "Disable screen" : "Allow screen"}</button><button className={control} disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, speaker.userId))}>Remove</button></div></div>)}
      </section>
    </div>
  ) : null;

  // ===== DESKTOP STUDIO (host, wide) — 1:1 recreation of the reference image =====
  if (isHost && wide) {
    const uptime = stream ? formatUptime(nowTs - stream.startedAt) : "0m";
    const live = viewerCount ?? state?.speakers.length ?? 0;
    const creatorName = stream?.creator?.displayName ?? "You";
    const controls = [
      { icon: I.invite, title: "Invite Guest", sub: "Invite someone to join your stream" as string, badge: undefined as number | undefined },
      { icon: I.mic, title: "Request Mic", sub: "View and manage mic requests", badge: requested.length || undefined },
      { icon: I.shield, title: "Moderation", sub: "Ban, timeout, or manage users", badge: undefined },
      { icon: I.gear, title: "Stream Settings", sub: "Title, category, tags, quality", badge: undefined },
      { icon: I.chart, title: "Analytics", sub: "View stream performance", badge: undefined },
      { icon: I.dollar, title: "Monetization", sub: "Manage rewards & subscriptions", badge: undefined },
    ];
    const ctrlBtn = (icon: ReactNode, label: string, onClick: (() => void) | undefined, opts?: { active?: boolean; badge?: number; danger?: boolean }) => (
      <button onClick={onClick} className="relative flex min-w-[66px] flex-col items-center gap-1 rounded-xl border border-border bg-surface1 px-3 py-2 text-[11px] font-medium text-text-secondary transition hover:border-borderStrong hover:text-text">
        <span className={opts?.active ? "text-[#5028dc]" : opts?.danger ? "text-[#f0466e]" : ""}>{icon}</span>
        <span>{label}</span>
        {opts?.badge ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#5028dc] px-1 text-[10px] font-bold text-white">{opts.badge}</span> : null}
      </button>
    );
    const statRow = (label: string, value: ReactNode, delta: string) => (
      <div className="flex items-center justify-between">
        <div><p className="text-lg font-bold leading-none text-text">{value}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">{label}</p></div>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-500"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m6 15 6-6 6 6" /></svg>{delta}</span>
      </div>
    );
    const infoCard = (head: ReactNode, body: ReactNode) => <div className={`${S.card} p-3`}><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">{head}</p>{body}</div>;

    return (
      <div className="flex h-full min-h-0 flex-col bg-night text-text">
        {/* ---- TOP BAR ---- */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface1 px-4">
          <button aria-label="Menu" className="grid h-9 w-9 place-items-center rounded-lg text-text-secondary hover:bg-surface2">{I.menu}</button>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#5028dc] to-[#8c64ff] text-white">{I.broadcast}</span>
            <span className="text-lg font-extrabold tracking-tight text-text">ENNOIA</span>
          </Link>
          <div className="relative mx-auto hidden w-full max-w-xl md:block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">{I.search}</span>
            <input aria-label="Search" placeholder="Search for channels, games, apps, or creators…" className="w-full rounded-full border border-border bg-surface2 py-2 pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:border-borderStrong focus:outline-none" />
          </div>
          <div className="flex items-center gap-1">
            <button aria-label="Notifications" className="grid h-9 w-9 place-items-center rounded-lg text-text-secondary hover:bg-surface2">{I.bell}</button>
            <button aria-label="Messages" className="grid h-9 w-9 place-items-center rounded-lg text-text-secondary hover:bg-surface2">{I.chatIcon}</button>
            <button aria-label="Games" className="grid h-9 w-9 place-items-center rounded-lg text-text-secondary hover:bg-surface2">{I.gamepad}</button>
            <span className="ml-1 inline-flex items-center gap-2 rounded-xl border border-[#8c64ff]/40 px-3 py-1.5 text-sm font-semibold text-[#5028dc]">{I.broadcast}Go Live</span>
            <span className="ml-1"><Avatar name={creatorName} url={stream?.creator?.avatarUrl} size={32} /></span>
          </div>
        </header>

        {/* ---- 3-COLUMN BODY ---- */}
        <div className="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)_360px]">
          {/* LEFT SIDEBAR */}
          <aside className="min-h-0 space-y-4 overflow-y-auto border-r border-border bg-night p-4" aria-label="Stream controls">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5028dc] hover:underline">{I.arrowLeft} Back to Home</Link>
            <div className={`${S.card} p-4`}>
              <div className="flex items-start gap-3">
                <Avatar name={creatorName} url={stream?.creator?.avatarUrl} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-bold text-text">{creatorName}<span className="text-[#5028dc]">{I.check}</span></p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live Now</p>
                  <p className="mt-0.5 text-xs text-text-muted">{live} viewers · {uptime}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{stream?.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{["#Live", "#ENNOIA", "#Monad"].map((t) => <span key={t} className={S.chip}>{t}</span>)}</div>
              {onEnd && <button onClick={onEnd} className={`${S.purple} mt-4 flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold`}>{I.broadcast}End Stream</button>}
            </div>

            <div>
              <h3 className="mb-2 px-1 text-sm font-bold text-text">Stream Controls</h3>
              <div className={`${S.card} divide-y divide-border overflow-hidden`}>
                {controls.map((c) => (
                  <button key={c.title} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface2">
                    <span className={`${badge} relative shrink-0`}>{c.icon}{c.badge ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#5028dc] px-1 text-[10px] font-bold text-white">{c.badge}</span> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text">{c.title}</span><span className="block truncate text-xs text-text-muted">{c.sub}</span></span>
                    <span className="text-text-muted">{I.chevron}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 px-1 text-sm font-bold text-text">Live Stats</h3>
              <div className={`${S.card} space-y-3 p-4`}>
                {statRow("Viewers", live, DEMO.deltas.viewers)}
                {statRow("Total Watch Time", DEMO.watchTime, DEMO.deltas.watch)}
                {statRow("Followers", `+${followerCount ?? 0}`, DEMO.deltas.followers)}
              </div>
            </div>
            {error && <p role="alert" className={`${S.card} border-[#f0466e]/40 p-3 text-sm text-[#f0466e]`}>{error}</p>}
            <StartAudio label="Enable stream audio" />
          </aside>

          {/* CENTER */}
          <div className="min-h-0 overflow-y-auto bg-night p-4">
            {/* video */}
            <div data-theme="dark" className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)]">
              {videoSurface}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0466e] px-2 py-1 text-[11px] font-bold uppercase text-white"><span className="h-1.5 w-1.5 rounded-full bg-white" />Live</span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">{I.eye}{live}</span>
              </div>
              <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur">▂▃▄ 32ms</span>
            </div>

            {/* control bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ctrlBtn(isMicrophoneEnabled ? I.mic : I.micOff, isMicrophoneEnabled ? "Mute" : "Unmute", () => void act(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)), { active: isMicrophoneEnabled })}
              {canCamera && ctrlBtn(I.cam, "Camera", () => void act(() => localParticipant.setCameraEnabled(!isCameraEnabled), "Camera"), { active: isCameraEnabled })}
              {canScreen && ctrlBtn(I.screen, "Share", () => void act(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled), "Screen sharing"), { active: isScreenShareEnabled })}
              {ctrlBtn(I.invite, "Invite Guest", undefined)}
              {ctrlBtn(I.mic, "Request Mic", undefined, { badge: requested.length || undefined })}
              {ctrlBtn(I.more, "More", undefined)}
              <div className="ml-auto flex items-center gap-2">
                <span className={`${S.purple} inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold`}><span className="h-1.5 w-1.5 rounded-full bg-white" />Live</span>
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface1 px-3 py-2 text-sm font-semibold text-text"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>{live}</span>
              </div>
            </div>

            {/* title + meta */}
            <div className="mt-4 flex items-start gap-3">
              <Avatar name={creatorName} url={stream?.creator?.avatarUrl} size={40} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-lg font-bold text-text">{stream?.title ?? "Live"}<span className="text-[#5028dc]">{I.check}</span></p>
                <p className="mt-0.5 text-sm text-text-muted">{creatorName} · {live} watching · live {uptime}</p>
                <p className="mt-1.5 text-sm text-text-secondary">Reactions from the crowd surface Moments and reward the first curators. Hang out, react, and enjoy the stream.</p>
              </div>
            </div>

            {/* 4 info cards (presentational demo) */}
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {infoCard(<><span className="text-[#5028dc]">{I.star}</span>Current Goal</>, <><p className="text-sm font-semibold text-text">{DEMO.goalLabel}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface3"><div className="h-full rounded-full bg-gradient-to-r from-[#5028dc] to-[#8c64ff]" style={{ width: "83%" }} /></div><p className="mt-1 text-[11px] text-text-muted">12.4K / 15K</p></>)}
              {infoCard("Latest Follower", <div className="flex items-center gap-2"><Avatar name={DEMO.latestFollower} size={26} /><div><p className="text-sm font-semibold text-text">{DEMO.latestFollower}</p><p className="text-[11px] text-text-muted">{DEMO.latestFollowerAgo}</p></div></div>)}
              {infoCard(<>Top Supporter <span className="text-[#f0dca0]">{I.crown}</span></>, <div className="flex items-center gap-2"><Avatar name={DEMO.topSupporter} size={26} /><div><p className="text-sm font-semibold text-text">{DEMO.topSupporter}</p><p className="text-[11px] font-semibold text-[#5028dc]">{DEMO.topSupporterAmount}</p></div></div>)}
              {infoCard(<><span className="text-[#5028dc]">{I.gift}</span>Recent Cheers</>, <div><p className="text-sm font-semibold text-text">{DEMO.cheersUser}</p><p className="text-[11px] text-text-muted">{DEMO.cheersAmount}</p></div>)}
            </div>

            {/* REAL host popovers — the image's "Mic Requests" + "Guest Invite" cards, functional */}
            {(requested.length > 0 || invited.length > 0 || approved.length > 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className={`${S.card} p-3`}>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">{I.mic}Mic Requests ({requested.length})</p>
                  {requested.length === 0 && <p className="text-xs text-text-muted">No pending requests.</p>}
                  {requested.map((sp) => (
                    <div key={sp.userId} className="mt-2 flex items-center gap-2">
                      <Avatar name={nameOf(sp.userId)} size={28} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text">{nameOf(sp.userId)}</p><p className="text-[11px] text-text-muted">Wants to join with mic</p></div>
                      <button disabled={pending} onClick={() => void act(() => api.approveSpeaker(streamId, sp.userId))} className={`${S.purple} px-3 py-1 text-xs font-semibold`}>Accept</button>
                      <button disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, sp.userId))} className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-text-secondary hover:border-borderStrong">Decline</button>
                    </div>
                  ))}
                  {approved.map((sp) => (
                    <div key={sp.userId} className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <Avatar name={nameOf(sp.userId)} size={28} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text">{nameOf(sp.userId)}</p><p className="text-[11px] text-text-muted">{!participants.some((p) => p.identity === sp.userId) ? "Not in room" : `Mic ${micLiveFor(sp.userId) ? "live" : "off"} · Cam ${cameraLiveFor(sp.userId) ? "live" : "off"}`}</p></div>
                      <button disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, sp.userId, { canCamera: !sp.canCamera }))} className="rounded-lg border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-borderStrong">{sp.canCamera ? "− Cam" : "+ Cam"}</button>
                      <button disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, sp.userId))} className="rounded-lg border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-borderStrong">Remove</button>
                    </div>
                  ))}
                </div>
                <div className={`${S.card} p-3`}>
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">{I.invite}Guest Invite</p>
                  <p className="text-xs text-text-muted">Invite a viewer to join your stream.</p>
                  <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                    {participants.filter((p) => p.identity !== hostId && !state?.speakers.some((s) => s.userId === p.identity)).map((p) => (
                      <div key={p.identity} className="flex items-center gap-2"><Avatar name={p.name || p.identity} size={26} /><span className="min-w-0 flex-1 truncate text-sm text-text">{p.name || p.identity}</span><button disabled={pending} onClick={() => void act(() => api.inviteSpeaker(streamId, p.identity))} className={`${S.purple} px-3 py-1 text-xs font-semibold`}>Invite</button></div>
                    ))}
                    {invited.map((sp) => <p key={sp.userId} className="text-[11px] text-text-muted">Invite pending · {nameOf(sp.userId)}</p>)}
                    {participants.filter((p) => p.identity !== hostId && !state?.speakers.some((s) => s.userId === p.identity)).length === 0 && invited.length === 0 && <p className="text-xs text-text-muted">No viewers to invite yet.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: chat + moderation */}
          <aside className="grid min-h-0 grid-rows-[1fr_300px] gap-3 border-l border-border bg-night p-3" aria-label="Chat and moderation">
            <div className={`${S.card} flex min-h-0 flex-col overflow-hidden`}>
              <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="flex items-center gap-2 font-bold text-text">{I.chatIcon}Live Chat</span>
                <span className="flex items-center gap-2 text-xs text-text-muted"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 19a5 5 0 0 0-3-4.6" /></svg>{live} online <span className="text-text-muted">{I.gear}</span></span>
              </header>
              <LiveChat streamId={streamId} isHost onlineCount={live} className="min-h-0 flex-1 border-0" />
            </div>
            <div className={`${S.card} flex min-h-0 flex-col overflow-hidden`}>
              <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 font-bold text-text">{I.shield}Moderation</header>
              <div className="flex gap-4 border-b border-border px-3 text-sm">
                <span className="-mb-px border-b-2 border-[#5028dc] py-2 font-semibold text-[#5028dc]">Bans</span>
                <span className="py-2 text-text-muted">Timeouts</span>
                <span className="py-2 text-text-muted">AutoMod</span>
              </div>
              <div className="px-3 py-2"><input aria-label="Search users" placeholder="Search users…" className="w-full rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none" /></div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
                {DEMO.bans.map((b) => (
                  <div key={b.name} className="flex items-center gap-2 py-1.5">
                    <Avatar name={b.name} size={28} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text">{b.name}</p><p className="text-[11px] text-text-muted">{b.meta}</p></div>
                    <button className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:border-borderStrong">{b.action}</button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
        <RoomAudioRenderer />
      </div>
    );
  }

  // ===== DEFAULT (viewer / speaker / narrow host) — unchanged behaviour =====
  return (
    <div className="flex h-full flex-col bg-black md:flex-row">
      <div className="relative min-h-0 flex-1 bg-black">{videoSurface}</div>
      <aside className="max-h-[42%] w-full overflow-y-auto border-t border-border bg-surface1 p-4 md:max-h-full md:w-72 md:border-l md:border-t-0" aria-label={isHost ? "Host controls" : "Audience controls"}>
        <p className="font-mono text-micro uppercase tracking-[0.14em] text-lime">{isHost ? "Host studio" : isSpeaker ? "Speaker seat" : "Watching live"}</p>
        <p className="mt-2 text-bodysm text-text-secondary">{isHost ? "You control who can speak, show camera, or share a screen." : isSpeaker ? "Your speaker seat is ready. Turn on your mic or camera when you choose." : "Ask the host for a mic if you want to speak."}</p>
        {(isHost || isSpeaker) && <div className="mt-4">{avControls}</div>}
        {isSpeaker && !speakerPermissionReady && <p className="mt-3 text-bodysm text-text-secondary">Speaker permission is syncing with the room…</p>}
        {!state && <p className="mt-4 text-bodysm text-text-secondary">Loading speaker status…</p>}
        {state && !isHost && !isSpeaker && !state.mySpeaker && <button className={`${control} mt-4 w-full`} disabled={pending} onClick={() => void act(() => api.requestMic(streamId))}>Request mic</button>}
        {state?.mySpeaker?.status === "requested" && <p className="mt-4 text-bodysm text-text-secondary">Request sent. The host chooses who joins.</p>}
        {state?.mySpeaker?.status === "invited" && <button className={`${control} mt-4 w-full border-lime text-lime`} disabled={pending} onClick={() => void act(() => api.acceptSpeakerInvite(streamId))}>Accept invite</button>}
        {isSpeaker && <p className="mt-3 text-bodysm text-text-secondary">Mic {micLiveFor(localParticipant.identity) ? "live" : "off"} · Camera {cameraLiveFor(localParticipant.identity) ? "live" : "off"}. {!micLiveFor(localParticipant.identity) && "Select Enable mic and allow browser access to speak."}</p>}
        {isSpeaker && <button className={`${control} mt-3 w-full`} disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, localParticipant.identity))}>Leave speaker seat</button>}
        {hostSections && <div className="mt-5">{hostSections}</div>}
        {error && <p role="alert" className="mt-4 border border-error px-3 py-2 text-bodysm text-error">{error}</p>}
        <StartAudio label="Enable stream audio" />
      </aside>
      <RoomAudioRenderer />
    </div>
  );
}

export function LiveKitStage({ streamId, hostId, stream, viewerCount, followerCount, onEnd }: { streamId: string; hostId: string } & StudioMeta) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setCredentials(null); setError(null);
    api.livekitToken(streamId, controller.signal)
      .then((value) => { if (active) setCredentials(value); })
      .catch(() => { if (active) setError("Could not join this live room. Check your connection and retry."); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [streamId, attempt]);
  if (error) return <div className="grid h-full place-items-center bg-black text-text-secondary"><div className="text-center"><p>{error}</p><button className={`${control} mt-3`} onClick={() => setAttempt((value) => value + 1)}>Retry room connection</button></div></div>;
  if (!credentials) return <div className="grid h-full place-items-center bg-black text-text-secondary">Joining live…</div>;
  return <LiveKitRoom token={credentials.token} serverUrl={credentials.url} connect audio={credentials.role === "host"} video={credentials.role === "host"} data-lk-theme="default" className="h-full" onError={(cause) => setError(cause.message)}><RoomStage streamId={streamId} hostId={hostId} initialRole={credentials.role} stream={stream} viewerCount={viewerCount} followerCount={followerCount} onEnd={onEnd} /></LiveKitRoom>;
}
