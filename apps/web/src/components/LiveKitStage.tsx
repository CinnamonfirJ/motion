import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useLocalParticipant, useLocalParticipantPermissions, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { api, type LiveRoomDTO, type StreamDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LiveChat } from "./LiveChat";
import { Avatar, LivePill } from "./ui";

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

  // ===== DESKTOP STUDIO (host, wide) — reference structure, ENNOIA sharp style =====
  if (isHost && wide) {
    const uptime = stream ? formatUptime(nowTs - stream.startedAt) : "";
    const live = viewerCount ?? state?.speakers.length ?? 0;
    return (
      <div className="grid h-full min-h-0 grid-cols-[248px_minmax(0,1fr)_340px] bg-night text-text">
        {/* LEFT: channel + stats + controls */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface1 p-4" aria-label="Stream controls">
          <div className="flex items-center gap-3">
            <Avatar name={stream?.creator?.displayName ?? "Host"} url={stream?.creator?.avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-text">{stream?.creator?.displayName ?? "You"}</p>
              <p className="flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.1em] text-error"><span className="h-1.5 w-1.5 bg-error" aria-hidden />Live now</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center">
            <div><p className="text-h3 text-text">{live}</p><p className="font-mono text-micro uppercase tracking-[0.08em] text-text-muted">Viewers</p></div>
            <div><p className="text-h3 text-text">{followerCount ?? "—"}</p><p className="font-mono text-micro uppercase tracking-[0.08em] text-text-muted">Followers</p></div>
            <div><p className="text-h3 text-text">{uptime || "—"}</p><p className="font-mono text-micro uppercase tracking-[0.08em] text-text-muted">Uptime</p></div>
          </div>
          <p className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Broadcast</p>
          {avControls}
          {onEnd && <button className="border border-error/60 bg-error/10 px-3 py-2.5 font-mono text-micro uppercase tracking-[0.1em] text-error hover:bg-error/20" onClick={onEnd}>■ End stream</button>}
          {error && <p role="alert" className="border border-error px-3 py-2 text-bodysm text-error">{error}</p>}
          <StartAudio label="Enable stream audio" />
        </aside>

        {/* CENTER: video + title */}
        <div className="flex min-h-0 flex-col">
          <div data-theme="dark" className="relative min-h-0 flex-1 bg-black">
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2"><LivePill count={live} /></div>
            {videoSurface}
          </div>
          <div className="shrink-0 border-t border-border bg-surface1 p-4">
            <h1 className="text-h3 text-text">{stream?.title ?? "Live"}</h1>
            <p className="mt-1 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">Your studio · {live} watching{uptime ? ` · live ${uptime}` : ""}</p>
          </div>
        </div>

        {/* RIGHT: chat + moderation */}
        <aside className="grid min-h-0 grid-rows-[1fr_auto] border-l border-border" aria-label="Chat and moderation">
          <LiveChat streamId={streamId} isHost onlineCount={live} className="min-h-0 border-0 border-b border-border" />
          <div className="max-h-[42%] min-h-0 overflow-y-auto bg-surface1 p-4">
            <h2 className="mb-3 font-mono text-micro uppercase tracking-[0.14em] text-lime">Moderation</h2>
            {hostSections ?? <p className="text-bodysm text-text-muted">Loading room…</p>}
          </div>
        </aside>
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
