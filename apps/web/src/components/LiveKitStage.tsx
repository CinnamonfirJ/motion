import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Menu, Search, Bell, MessageSquare, Gamepad2, Radio, ArrowLeft, BadgeCheck, Mic, MicOff,
  Video, ScreenShare, UserPlus, MoreHorizontal, Shield, Settings, BarChart3, DollarSign,
  ChevronRight, ChevronUp, Star, Crown, Gift, Eye, Users, Signal,
} from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useLocalParticipant, useLocalParticipantPermissions, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { api, type LiveRoomDTO, type StreamDTO, type BanDTO } from "../lib/api";
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

// ---- studio (reference LAYOUT) rendered in ENNOIA's real style: SHARP rectangles, NO rounded,
// NO gradients, NO shadows, app color tokens, lucide icons. ----
const S = {
  card: "border border-border bg-surface1",
  primary: "bg-brand text-white transition hover:bg-brandHover active:translate-y-px",
  chip: "inline-flex items-center border border-border bg-surface2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-leaf",
  soft: "border border-border bg-surface2 transition hover:border-borderStrong",
};
const badge = "grid h-9 w-9 place-items-center border border-border bg-surface2 text-leaf";
const I = {
  mic: <Mic size={18} />, micOff: <MicOff size={18} />, cam: <Video size={18} />, screen: <ScreenShare size={18} />,
  invite: <UserPlus size={18} />, more: <MoreHorizontal size={18} />, broadcast: <Radio size={16} />, eye: <Eye size={15} />,
  shield: <Shield size={16} />, gear: <Settings size={15} />, chart: <BarChart3 size={18} />, dollar: <DollarSign size={18} />,
  chevron: <ChevronRight size={16} />, star: <Star size={14} />, crown: <Crown size={14} />, search: <Search size={16} />,
  bell: <Bell size={18} />, chatIcon: <MessageSquare size={16} />, gamepad: <Gamepad2 size={18} />, menu: <Menu size={20} />,
  arrowLeft: <ArrowLeft size={14} />, gift: <Gift size={14} />, check: <BadgeCheck size={15} />, up: <ChevronUp size={12} />,
  users: <Users size={14} />, signal: <Signal size={14} />,
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
  const [bans, setBans] = useState<BanDTO[]>([]);
  const wide = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadBans = useCallback(async () => {
    try { setBans((await api.bans(streamId)).bans); } catch { /* non-host or offline */ }
  }, [streamId]);
  useEffect(() => {
    if (initialRole !== "host") return;
    void loadBans();
    const off = realtime.on((e) => { if (e.t === "moderation" && e.streamId === streamId) void loadBans(); });
    return off;
  }, [initialRole, streamId, loadBans]);
  const moderate = async (fn: () => Promise<unknown>) => {
    setPending(true); setError(null);
    try { await fn(); await loadBans(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Moderation action failed."); }
    finally { setPending(false); }
  };

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

  // ===== DESKTOP STUDIO (host, wide) — reference LAYOUT in ENNOIA's SHARP style =====
  if (isHost && wide) {
    const uptime = stream ? formatUptime(nowTs - stream.startedAt) : "0m";
    const live = viewerCount ?? state?.speakers.length ?? 0;
    const creatorName = stream?.creator?.displayName ?? "You";
    const eyebrow = "font-mono text-micro uppercase tracking-[0.14em] text-text-secondary";
    const controls = [
      { icon: I.invite, title: "Invite Guest", sub: "Invite someone to join your stream" as string, badge: undefined as number | undefined },
      { icon: I.mic, title: "Mic Requests", sub: "View and manage mic requests", badge: requested.length || undefined },
      { icon: I.shield, title: "Moderation", sub: "Ban, timeout, or manage users", badge: undefined },
      { icon: I.gear, title: "Stream Settings", sub: "Title, category, tags, quality", badge: undefined },
      { icon: I.chart, title: "Analytics", sub: "View stream performance", badge: undefined },
      { icon: I.dollar, title: "Monetization", sub: "Manage rewards & subscriptions", badge: undefined },
    ];
    const ctrlBtn = (icon: ReactNode, label: string, onClick: (() => void) | undefined, opts?: { active?: boolean; badge?: number }) => (
      <button onClick={onClick} className={`relative flex min-w-[66px] flex-col items-center gap-1 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition ${opts?.active ? "border-leaf/60 bg-surface2 text-leaf" : "border-border bg-surface1 text-text-secondary hover:border-borderStrong hover:text-text"}`}>
        <span>{icon}</span>
        <span>{label}</span>
        {opts?.badge ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center bg-brand px-1 text-[10px] font-bold text-white">{opts.badge}</span> : null}
      </button>
    );
    const statRow = (label: string, value: ReactNode, delta: string) => (
      <div className="flex items-center justify-between">
        <div><p className="text-h3 leading-none text-text">{value}</p><p className={`mt-1 ${eyebrow}`}>{label}</p></div>
        <span className="inline-flex items-center gap-0.5 font-mono text-micro font-semibold text-success">{I.up}{delta}</span>
      </div>
    );
    const infoCard = (head: ReactNode, body: ReactNode) => <div className={`${S.card} p-3`}><p className={`mb-2 flex items-center gap-1.5 ${eyebrow}`}>{head}</p>{body}</div>;
    const outlineBtn = "border border-border px-3 py-1 font-mono text-micro uppercase tracking-[0.08em] text-text-secondary hover:border-borderStrong hover:text-text disabled:opacity-40";
    const primaryBtn = `${S.primary} px-3 py-1 font-mono text-micro uppercase tracking-[0.08em] disabled:opacity-40`;

    return (
      <div className="flex h-full min-h-0 flex-col bg-night text-text">
        {/* ---- 3-COLUMN BODY ---- */}
        <div className="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)_360px]">
          {/* LEFT SIDEBAR */}
          <aside className="min-h-0 space-y-4 overflow-y-auto border-r border-border bg-night p-4" aria-label="Stream controls">
            <Link to="/" className="inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.1em] text-leaf hover:underline">{I.arrowLeft} Back to Home</Link>
            <div className={`${S.card} p-4`}>
              <div className="flex items-start gap-3">
                <Avatar name={creatorName} url={stream?.creator?.avatarUrl} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold text-text">{creatorName}<span className="text-leaf">{I.check}</span></p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.1em] text-success"><span className="h-1.5 w-1.5 bg-success" />Live Now</p>
                  <p className="mt-1 font-mono text-micro text-text-muted">{live} viewers · {uptime}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-bodysm text-text-secondary">{stream?.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{["#Live", "#ENNOIA", "#Monad"].map((t) => <span key={t} className={S.chip}>{t}</span>)}</div>
              {onEnd && <button onClick={onEnd} className={`${S.primary} mt-4 flex w-full items-center justify-center gap-2 py-2.5 font-mono text-micro uppercase tracking-[0.12em]`}>{I.broadcast}End Stream</button>}
            </div>

            <div>
              <h3 className={`mb-2 px-1 ${eyebrow}`}>Stream Controls</h3>
              <div className={`${S.card} divide-y divide-border`}>
                {controls.map((c) => (
                  <button key={c.title} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface2">
                    <span className={`${badge} relative shrink-0`}>{c.icon}{c.badge ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center bg-brand px-1 text-[10px] font-bold text-white">{c.badge}</span> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block text-bodysm font-semibold text-text">{c.title}</span><span className="block truncate font-mono text-micro text-text-muted">{c.sub}</span></span>
                    <span className="text-text-muted">{I.chevron}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className={`mb-2 px-1 ${eyebrow}`}>Live Stats</h3>
              <div className={`${S.card} space-y-3 p-4`}>
                {statRow("Viewers", live, DEMO.deltas.viewers)}
                {statRow("Total Watch Time", DEMO.watchTime, DEMO.deltas.watch)}
                {statRow("Followers", `+${followerCount ?? 0}`, DEMO.deltas.followers)}
              </div>
            </div>
            {error && <p role="alert" className={`${S.card} border-error/50 p-3 text-bodysm text-error`}>{error}</p>}
            <StartAudio label="Enable stream audio" />
          </aside>

          {/* CENTER */}
          <div className="min-h-0 overflow-y-auto bg-night p-4">
            {/* video */}
            <div data-theme="dark" className="relative aspect-video overflow-hidden border border-border bg-black">
              {videoSurface}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-error px-2 py-1 font-mono text-micro font-bold uppercase tracking-[0.1em] text-white"><span className="h-1.5 w-1.5 bg-white" />Live</span>
                <span className="inline-flex items-center gap-1 bg-black/50 px-2 py-1 font-mono text-micro font-semibold text-white backdrop-blur">{I.eye}{live}</span>
              </div>
              <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 bg-black/50 px-2 py-1 font-mono text-micro text-success backdrop-blur">{I.signal}32ms</span>
            </div>

            {/* control bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ctrlBtn(isMicrophoneEnabled ? I.mic : I.micOff, isMicrophoneEnabled ? "Mute" : "Unmute", () => void act(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)), { active: isMicrophoneEnabled })}
              {canCamera && ctrlBtn(I.cam, "Camera", () => void act(() => localParticipant.setCameraEnabled(!isCameraEnabled), "Camera"), { active: isCameraEnabled })}
              {canScreen && ctrlBtn(I.screen, "Share", () => void act(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled), "Screen sharing"), { active: isScreenShareEnabled })}
              {ctrlBtn(I.invite, "Invite Guest", undefined)}
              {ctrlBtn(I.mic, "Mic Requests", undefined, { badge: requested.length || undefined })}
              {ctrlBtn(I.more, "More", undefined)}
              <div className="ml-auto flex items-center gap-2">
                <span className={`${S.primary} inline-flex items-center gap-1.5 px-3 py-2 font-mono text-micro uppercase tracking-[0.1em]`}><span className="h-1.5 w-1.5 bg-white" />Live</span>
                <span className="inline-flex items-center gap-1.5 border border-border bg-surface1 px-3 py-2 font-mono text-micro font-semibold text-text">{I.users}{live}</span>
              </div>
            </div>

            {/* title + meta */}
            <div className="mt-4 flex items-start gap-3">
              <Avatar name={creatorName} url={stream?.creator?.avatarUrl} size={40} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-h3 text-text">{stream?.title ?? "Live"}<span className="text-leaf">{I.check}</span></p>
                <p className="mt-1 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">{creatorName} · {live} watching · live {uptime}</p>
                <p className="mt-1.5 text-bodysm text-text-secondary">Reactions from the crowd surface Moments and reward the first curators. Hang out, react, and enjoy the stream.</p>
              </div>
            </div>

            {/* 4 info cards (presentational demo) */}
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {infoCard(<><span className="text-leaf">{I.star}</span>Current Goal</>, <><p className="text-bodysm font-semibold text-text">{DEMO.goalLabel}</p><div className="mt-2 h-1.5 overflow-hidden bg-surface3"><div className="h-full bg-brand" style={{ width: "83%" }} /></div><p className="mt-1 font-mono text-micro text-text-muted">12.4K / 15K</p></>)}
              {infoCard("Latest Follower", <div className="flex items-center gap-2"><Avatar name={DEMO.latestFollower} size={26} /><div><p className="text-bodysm font-semibold text-text">{DEMO.latestFollower}</p><p className="font-mono text-micro text-text-muted">{DEMO.latestFollowerAgo}</p></div></div>)}
              {infoCard(<>Top Supporter <span className="text-warning">{I.crown}</span></>, <div className="flex items-center gap-2"><Avatar name={DEMO.topSupporter} size={26} /><div><p className="text-bodysm font-semibold text-text">{DEMO.topSupporter}</p><p className="font-mono text-micro font-semibold text-leaf">{DEMO.topSupporterAmount}</p></div></div>)}
              {infoCard(<><span className="text-leaf">{I.gift}</span>Recent Cheers</>, <div><p className="text-bodysm font-semibold text-text">{DEMO.cheersUser}</p><p className="font-mono text-micro text-text-muted">{DEMO.cheersAmount}</p></div>)}
            </div>

            {/* REAL host popovers — the image's "Mic Requests" + "Guest Invite" cards, functional */}
            {(requested.length > 0 || invited.length > 0 || approved.length > 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className={`${S.card} p-3`}>
                  <p className="mb-2 flex items-center gap-1.5 text-bodysm font-semibold text-text">{I.mic}Mic Requests ({requested.length})</p>
                  {requested.length === 0 && <p className="font-mono text-micro text-text-muted">No pending requests.</p>}
                  {requested.map((sp) => (
                    <div key={sp.userId} className="mt-2 flex items-center gap-2">
                      <Avatar name={nameOf(sp.userId)} size={28} />
                      <div className="min-w-0 flex-1"><p className="truncate text-bodysm font-semibold text-text">{nameOf(sp.userId)}</p><p className="font-mono text-micro text-text-muted">Wants to join with mic</p></div>
                      <button disabled={pending} onClick={() => void act(() => api.approveSpeaker(streamId, sp.userId))} className={primaryBtn}>Accept</button>
                      <button disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, sp.userId))} className={outlineBtn}>Decline</button>
                    </div>
                  ))}
                  {approved.map((sp) => (
                    <div key={sp.userId} className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <Avatar name={nameOf(sp.userId)} size={28} />
                      <div className="min-w-0 flex-1"><p className="truncate text-bodysm font-semibold text-text">{nameOf(sp.userId)}</p><p className="font-mono text-micro text-text-muted">{!participants.some((p) => p.identity === sp.userId) ? "Not in room" : `Mic ${micLiveFor(sp.userId) ? "live" : "off"} · Cam ${cameraLiveFor(sp.userId) ? "live" : "off"}`}</p></div>
                      <button disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, sp.userId, { canCamera: !sp.canCamera }))} className={outlineBtn}>{sp.canCamera ? "− Cam" : "+ Cam"}</button>
                      <button disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, sp.userId))} className={outlineBtn}>Remove</button>
                    </div>
                  ))}
                </div>
                <div className={`${S.card} p-3`}>
                  <p className="mb-1 flex items-center gap-1.5 text-bodysm font-semibold text-text">{I.invite}Guest Invite</p>
                  <p className="font-mono text-micro text-text-muted">Invite a viewer to join your stream.</p>
                  <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                    {participants.filter((p) => p.identity !== hostId && !state?.speakers.some((s) => s.userId === p.identity)).map((p) => (
                      <div key={p.identity} className="flex items-center gap-2"><Avatar name={p.name || p.identity} size={26} /><span className="min-w-0 flex-1 truncate text-bodysm text-text">{p.name || p.identity}</span><button disabled={pending} onClick={() => void act(() => api.inviteSpeaker(streamId, p.identity))} className={primaryBtn}>Invite</button></div>
                    ))}
                    {invited.map((sp) => <p key={sp.userId} className="font-mono text-micro text-text-muted">Invite pending · {nameOf(sp.userId)}</p>)}
                    {participants.filter((p) => p.identity !== hostId && !state?.speakers.some((s) => s.userId === p.identity)).length === 0 && invited.length === 0 && <p className="font-mono text-micro text-text-muted">No viewers to invite yet.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: chat + moderation */}
          <aside className="grid min-h-0 grid-rows-[1fr_300px] gap-3 border-l border-border bg-night p-3" aria-label="Chat and moderation">
            <div className={`${S.card} flex min-h-0 flex-col overflow-hidden`}>
              <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="flex items-center gap-2 text-bodysm font-semibold text-text">{I.chatIcon}Live Chat</span>
                <span className="flex items-center gap-2 font-mono text-micro text-text-muted">{I.users}{live} online <span className="text-text-muted">{I.gear}</span></span>
              </header>
              <LiveChat streamId={streamId} isHost onlineCount={live} className="min-h-0 flex-1 border-0" onModerate={(userId) => void moderate(() => api.banUser(streamId, userId, "timeout", 10 * 60_000))} />
            </div>
            <div className={`${S.card} flex min-h-0 flex-col overflow-hidden`}>
              <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-bodysm font-semibold text-text">{I.shield}Moderation</header>
              <div className="flex gap-4 border-b border-border px-3 font-mono text-micro uppercase tracking-[0.08em]">
                <span className="-mb-px border-b-2 border-leaf py-2 font-semibold text-leaf">Bans</span>
                <span className="py-2 text-text-muted">Timeouts</span>
                <span className="py-2 text-text-muted">AutoMod</span>
              </div>
              <div className="px-3 py-2"><input aria-label="Search users" placeholder="Search users…" className="w-full border border-border bg-surface2 px-3 py-1.5 text-bodysm text-text placeholder:text-text-muted focus:border-borderStrong focus:outline-none" /></div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
                {bans.length === 0 ? (
                  <p className="mt-2 font-mono text-micro text-text-muted">No bans or timeouts. Hover a chat message and use ⊘ to time a viewer out.</p>
                ) : bans.map((b) => (
                  <div key={b.userId} className="flex items-center gap-2 py-1.5">
                    <Avatar name={b.displayName} url={b.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1"><p className="truncate text-bodysm font-semibold text-text">{b.displayName}</p><p className="font-mono text-micro text-text-muted">{b.kind === "timeout" ? `Timed out${b.expiresAt ? ` · ${Math.max(0, Math.round((b.expiresAt - nowTs) / 60000))}m left` : ""}` : "Banned"}</p></div>
                    <button className={outlineBtn} disabled={pending} onClick={() => void moderate(() => api.unban(streamId, b.userId))}>{b.kind === "timeout" ? "Remove" : "Unban"}</button>
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
