import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useLocalParticipant, useLocalParticipantPermissions, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { api, type LiveRoomDTO } from "../lib/api";
import { realtime } from "../lib/realtime";

type Role = "host" | "speaker" | "viewer";
interface Credentials { url: string; token: string; role: Role }
const control = "border border-border bg-surface2 px-3 py-2 font-mono text-micro uppercase tracking-[0.1em] text-text hover:border-borderStrong disabled:opacity-40";

function RoomStage({ streamId, hostId, initialRole }: { streamId: string; hostId: string; initialRole: Role }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const localPermissions = useLocalParticipantPermissions();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const micTracks = useTracks([Track.Source.Microphone]);
  const [state, setState] = useState<LiveRoomDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex h-full flex-col bg-black md:flex-row">
      <div className="relative min-h-0 flex-1 bg-black">
        {main && isTrackReference(main) ? <VideoTrack trackRef={main} className="h-full w-full object-contain" /> : (
          <div className="grid h-full place-items-center text-center text-text-secondary"><div><p className="font-mono text-micro uppercase tracking-[0.14em] text-lime">{hostInRoom || state?.hostConnected ? "Camera off" : "Host connecting"}</p><p className="mt-2 text-body">{nameOf(hostId)}</p></div></div>
        )}
        {state?.hostDisconnectedAt && state.isLive && !state.hostConnected && !hostInRoom && <p className="absolute bottom-4 left-4 border border-warning bg-black/75 px-3 py-2 font-mono text-micro uppercase text-warning">Host reconnecting · five-minute grace</p>}
        {side.length > 0 && <div className="absolute bottom-4 right-4 flex max-w-[60%] gap-2 overflow-x-auto">{side.map((item) => isTrackReference(item) && <div key={`${item.participant.identity}:${item.source}`} className="h-20 w-28 shrink-0 border border-border bg-surface1"><VideoTrack trackRef={item} className="h-full w-full object-cover" /></div>)}</div>}
      </div>
      <aside className="max-h-[42%] w-full overflow-y-auto border-t border-border bg-surface1 p-4 md:max-h-full md:w-72 md:border-l md:border-t-0 md:pt-20" aria-label={isHost ? "Host controls" : "Audience controls"}>
        <p className="font-mono text-micro uppercase tracking-[0.14em] text-lime">{isHost ? "Host studio" : isSpeaker ? "Speaker seat" : "Watching live"}</p>
        <p className="mt-2 text-bodysm text-text-secondary">{isHost ? "You control who can speak, show camera, or share a screen." : isSpeaker ? "Your speaker seat is ready. Turn on your mic or camera when you choose." : "Ask the host for a mic if you want to speak."}</p>
        {(isHost || isSpeaker) && <div className="mt-4 grid grid-cols-2 gap-2">
          <button className={control} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}>{isMicrophoneEnabled ? "Mute mic" : "Enable mic"}</button>
          {canCamera && <button className={control} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setCameraEnabled(!isCameraEnabled), "Camera")}>{isCameraEnabled ? "Camera off" : "Camera on"}</button>}
          {canScreen && <button className={`${control} col-span-2`} disabled={pending || !speakerPermissionReady} onClick={() => void act(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled), "Screen sharing")}>{isScreenShareEnabled ? "Stop sharing" : "Share screen"}</button>}
        </div>}
        {isSpeaker && !speakerPermissionReady && <p className="mt-3 text-bodysm text-text-secondary">Speaker permission is syncing with the room…</p>}
        {!state && <p className="mt-4 text-bodysm text-text-secondary">Loading speaker status…</p>}
        {state && !isHost && !isSpeaker && !state.mySpeaker && <button className={`${control} mt-4 w-full`} disabled={pending} onClick={() => void act(() => api.requestMic(streamId))}>Request mic</button>}
        {state?.mySpeaker?.status === "requested" && <p className="mt-4 text-bodysm text-text-secondary">Request sent. The host chooses who joins.</p>}
        {state?.mySpeaker?.status === "invited" && <button className={`${control} mt-4 w-full border-lime text-lime`} disabled={pending} onClick={() => void act(() => api.acceptSpeakerInvite(streamId))}>Accept invite</button>}
        {isSpeaker && <p className="mt-3 text-bodysm text-text-secondary">Mic {micLiveFor(localParticipant.identity) ? "live" : "off"} · Camera {cameraLiveFor(localParticipant.identity) ? "live" : "off"}. {!micLiveFor(localParticipant.identity) && "Select Enable mic and allow browser access to speak."}</p>}
        {isSpeaker && <button className={`${control} mt-3 w-full`} disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, localParticipant.identity))}>Leave speaker seat</button>}
        {isHost && state && <div className="mt-5 space-y-4">
          <section><h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Mic requests · {requested.length}</h3>{requested.length === 0 && <p className="mt-2 text-bodysm text-text-muted">No requests yet.</p>}{requested.map((speaker) => <div key={speaker.userId} className="mt-2 flex items-center justify-between gap-2 border border-border p-2"><span className="truncate text-bodysm">{nameOf(speaker.userId)}</span><button className={control} disabled={pending} onClick={() => void act(() => api.approveSpeaker(streamId, speaker.userId))}>Allow mic</button></div>)}</section>
          <section><h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Invite viewers</h3>{participants.filter((person) => person.identity !== hostId && !state?.speakers.some((speaker) => speaker.userId === person.identity)).map((person) => <div key={person.identity} className="mt-2 flex items-center justify-between gap-2 border border-border p-2"><span className="truncate text-bodysm">{person.name || person.identity}</span><button className={control} disabled={pending} onClick={() => void act(() => api.inviteSpeaker(streamId, person.identity))}>Invite</button></div>)}{invited.map((speaker) => <p key={speaker.userId} className="mt-2 text-bodysm text-text-muted">Invite pending · {nameOf(speaker.userId)}</p>)}</section>
          <section><h3 className="font-mono text-micro uppercase tracking-[0.14em] text-text-secondary">Speakers · {approved.length}</h3>{approved.map((speaker) => <div key={speaker.userId} className="mt-2 space-y-2 border border-border p-2"><p className="truncate text-bodysm">{nameOf(speaker.userId)}</p><p className="font-mono text-micro uppercase text-text-secondary">{!participants.some((person) => person.identity === speaker.userId) ? "Not in room" : `Mic ${micLiveFor(speaker.userId) ? "live" : "off"} · Camera ${cameraLiveFor(speaker.userId) ? "live" : "off"}`}</p><div className="flex flex-wrap gap-1"><button className={control} disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canCamera: !speaker.canCamera }))}>{speaker.canCamera ? "Disable camera" : "Allow camera"}</button><button className={control} disabled={pending} onClick={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canScreenShare: !speaker.canScreenShare }))}>{speaker.canScreenShare ? "Disable screen" : "Allow screen"}</button><button className={control} disabled={pending} onClick={() => void act(() => api.removeSpeaker(streamId, speaker.userId))}>Remove</button></div></div>)}</section>
        </div>}
        {error && <p role="alert" className="mt-4 border border-error px-3 py-2 text-bodysm text-error">{error}</p>}
        <StartAudio label="Enable stream audio" />
      </aside>
      <RoomAudioRenderer />
    </div>
  );
}

export function LiveKitStage({ streamId, hostId }: { streamId: string; hostId: string }) {
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
  return <LiveKitRoom token={credentials.token} serverUrl={credentials.url} connect audio={credentials.role === "host"} video={credentials.role === "host"} data-lk-theme="default" className="h-full" onError={(cause) => setError(cause.message)}><RoomStage streamId={streamId} hostId={hostId} initialRole={credentials.role} /></LiveKitRoom>;
}
