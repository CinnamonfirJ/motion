import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, findNodeHandle, NativeModules, Pressable, ScrollView, Text, View } from "react-native";
import { ScreenCapturePickerView } from "@livekit/react-native-webrtc";
import { AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useLocalParticipant, useParticipants, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { api, type LiveRoomDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { color, eyebrow, type } from "../theme";

type Role = "host" | "speaker" | "viewer";
interface Credentials { url: string; token: string; role: Role }

function Control({ title, onPress, disabled = false, accent = false }: { title: string; onPress: () => void; disabled?: boolean; accent?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ borderWidth: 1, borderColor: accent ? color.lime : color.border, backgroundColor: color.surface2, paddingHorizontal: 10, paddingVertical: 8, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}><Text style={{ ...eyebrow(10), color: accent ? color.lime : color.text }}>{title}</Text></Pressable>;
}

function BroadcastStage({ streamId, hostId, initialRole }: { streamId: string; hostId: string; initialRole: Role }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const screenPicker = useRef<View>(null);
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const [state, setState] = useState<LiveRoomDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = state?.role ?? initialRole;
  const isHost = role === "host";
  const isSpeaker = role === "speaker";
  const canCamera = isHost || (isSpeaker && !!state?.mySpeaker?.canCamera);
  const canScreen = (isHost || (isSpeaker && !!state?.mySpeaker?.canScreenShare)) && (process.env.EXPO_OS === "android" || process.env.EXPO_OS === "ios");

  const toggleScreen = async () => {
    if (isScreenShareEnabled) return localParticipant.setScreenShareEnabled(false);
    if (process.env.EXPO_OS === "ios") {
      const tag = findNodeHandle(screenPicker.current);
      if (tag == null || !NativeModules.ScreenCapturePickerViewManager?.show) {
        throw new Error("iOS screen sharing is unavailable in this build. Install a build with the ENNOIA broadcast extension.");
      }
      await NativeModules.ScreenCapturePickerViewManager.show(tag);
    }
    return localParticipant.setScreenShareEnabled(true);
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

  const act = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setError(null);
    try { await action(); await refresh(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "That action did not work. Try again.";
      setError(/permission denied|notallowed/i.test(message)
        ? "Microphone access was denied. Allow microphone access for ENNOIA in device settings, then select Enable mic again."
        : message);
    }
    finally { setPending(false); }
  };

  const main = tracks.find((item) => isTrackReference(item) && item.participant.identity === hostId && item.source === Track.Source.ScreenShare)
    ?? tracks.find((item) => isTrackReference(item) && item.participant.identity === hostId && item.source === Track.Source.Camera);
  const side = tracks.filter((item) => isTrackReference(item) && item !== main);
  const nameOf = (id: string) => participants.find((person) => person.identity === id)?.name || id;
  const hostInRoom = participants.some((person) => person.identity === hostId);
  const requested = state?.speakers.filter((speaker) => speaker.status === "requested") ?? [];
  const approved = state?.speakers.filter((speaker) => speaker.status === "approved") ?? [];
  const invited = state?.speakers.filter((speaker) => speaker.status === "invited") ?? [];

  return <View style={{ flex: 1, backgroundColor: color.night }}>
    {process.env.EXPO_OS === "ios" ? <View style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}><ScreenCapturePickerView ref={screenPicker} /></View> : null}
    <View style={{ flex: isHost ? 2 : 4, backgroundColor: color.night }}>
      {main && isTrackReference(main) ? <VideoTrack trackRef={main} style={{ flex: 1 }} objectFit="contain" /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}><Text style={{ color: color.lime, ...eyebrow(11) }}>{hostInRoom || state?.hostConnected ? "Camera off" : "Host connecting"}</Text><Text style={{ color: color.textSecondary, ...type.body }}>{nameOf(hostId)}</Text></View>}
      {state?.hostDisconnectedAt && state.isLive && !state.hostConnected && !hostInRoom ? <View style={{ position: "absolute", left: 12, bottom: 12, borderWidth: 1, borderColor: color.warning, backgroundColor: color.surface1, padding: 8 }}><Text style={{ color: color.warning, ...eyebrow(10) }}>Host reconnecting · five-minute grace</Text></View> : null}
      {side.length > 0 ? <ScrollView horizontal style={{ position: "absolute", right: 8, bottom: 8, maxWidth: "65%" }} contentContainerStyle={{ gap: 6 }}>{side.map((item) => isTrackReference(item) && <View key={`${item.participant.identity}:${item.source}`} style={{ width: 96, height: 72, borderWidth: 1, borderColor: color.border }}><VideoTrack trackRef={item} style={{ flex: 1 }} objectFit="cover" /></View>)}</ScrollView> : null}
    </View>
    <ScrollView style={{ flex: isHost ? 3 : 1, backgroundColor: color.surface1, borderTopWidth: 1, borderColor: color.border }} contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: color.lime, ...eyebrow(11) }}>{isHost ? "Host studio" : isSpeaker ? "Speaker seat" : "Watching live"}</Text>
      <Text style={{ color: color.textSecondary, ...type.bodysm }}>{isHost ? "You control who can speak, show camera, or share a screen." : isSpeaker ? "The host gave you a microphone." : "Ask the host for a mic if you want to speak."}</Text>
      {(isHost || isSpeaker) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Control title={isMicrophoneEnabled ? "Mute mic" : "Enable mic"} disabled={pending} onPress={() => void act(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))} />
        {canCamera ? <Control title={isCameraEnabled ? "Camera off" : "Camera on"} disabled={pending} onPress={() => void act(() => localParticipant.setCameraEnabled(!isCameraEnabled))} /> : null}
        {canScreen ? <Control title={isScreenShareEnabled ? "Stop sharing" : "Share screen"} disabled={pending} onPress={() => void act(toggleScreen)} /> : null}
      </View> : null}
      {!state ? <Text style={{ color: color.textSecondary, ...type.bodysm }}>Loading speaker status…</Text> : null}
      {state && !isHost && !isSpeaker && !state.mySpeaker ? <Control title="Request mic" disabled={pending} onPress={() => void act(() => api.requestMic(streamId))} /> : null}
      {state?.mySpeaker?.status === "requested" ? <Text style={{ color: color.textSecondary, ...type.bodysm }}>Request sent. The host chooses who joins.</Text> : null}
      {state?.mySpeaker?.status === "invited" ? <Control title="Accept speaker invite" accent disabled={pending} onPress={() => void act(() => api.acceptSpeakerInvite(streamId))} /> : null}
      {isSpeaker && !isMicrophoneEnabled ? <Text style={{ color: color.textSecondary, ...type.bodysm }}>Speaker access approved. Select Enable mic and allow microphone access to speak.</Text> : null}
      {isSpeaker ? <Control title="Leave speaker seat" disabled={pending} onPress={() => void act(() => api.removeSpeaker(streamId, localParticipant.identity))} /> : null}
      {isHost && state ? <>
        <Text style={{ color: color.textSecondary, ...eyebrow(10) }}>Mic requests · {requested.length}</Text>
        {requested.length === 0 ? <Text style={{ color: color.textMuted, ...type.bodysm }}>No requests yet.</Text> : requested.map((speaker) => <View key={speaker.userId} style={{ borderWidth: 1, borderColor: color.border, padding: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: color.text, ...type.bodysm }}>{nameOf(speaker.userId)}</Text><Control title="Allow mic" disabled={pending} onPress={() => void act(() => api.approveSpeaker(streamId, speaker.userId))} /></View>)}
        <Text style={{ color: color.textSecondary, ...eyebrow(10) }}>Invite viewers</Text>
        {participants.filter((person) => person.identity !== hostId && !state?.speakers.some((speaker) => speaker.userId === person.identity)).map((person) => <View key={person.identity} style={{ borderWidth: 1, borderColor: color.border, padding: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: color.text, ...type.bodysm }}>{person.name || person.identity}</Text><Control title="Invite" disabled={pending} onPress={() => void act(() => api.inviteSpeaker(streamId, person.identity))} /></View>)}
        {invited.map((speaker) => <Text key={speaker.userId} style={{ color: color.textMuted, ...type.bodysm }}>Invite pending · {nameOf(speaker.userId)}</Text>)}
        <Text style={{ color: color.textSecondary, ...eyebrow(10) }}>Speakers · {approved.length}</Text>
        {approved.map((speaker) => <View key={speaker.userId} style={{ borderWidth: 1, borderColor: color.border, padding: 8, gap: 8 }}><Text style={{ color: color.text, ...type.bodysm }}>{nameOf(speaker.userId)}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}><Control title={speaker.canCamera ? "Camera ✓" : "Allow camera"} disabled={pending} onPress={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canCamera: !speaker.canCamera }))} /><Control title={speaker.canScreenShare ? "Screen ✓" : "Allow screen"} disabled={pending} onPress={() => void act(() => api.setSpeakerPermissions(streamId, speaker.userId, { canScreenShare: !speaker.canScreenShare }))} /><Control title="Remove" disabled={pending} onPress={() => void act(() => api.removeSpeaker(streamId, speaker.userId))} /></View></View>)}
      </> : null}
      {error ? <Text selectable accessibilityRole="alert" style={{ color: color.error, ...type.bodysm }}>{error}</Text> : null}
    </ScrollView>
  </View>;
}

export function LiveKitStage({ streamId, hostId }: { streamId: string; hostId: string }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void AudioSession.startAudioSession();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setCredentials(null); setError(null);
    void api.livekitToken(streamId, controller.signal)
      .then((value) => { if (active) setCredentials(value); })
      .catch(() => { if (active) setError("Could not join this live room. Check your connection and retry."); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); void AudioSession.stopAudioSession(); };
  }, [streamId, attempt]);
  if (error) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}><Text selectable style={{ color: color.error, ...type.body, textAlign: "center" }}>{error}</Text><Control title="Retry room connection" onPress={() => setAttempt((value) => value + 1)} /></View>;
  if (!credentials) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={color.lime} /></View>;
  return <LiveKitRoom serverUrl={credentials.url} token={credentials.token} connect audio={credentials.role === "host"} video={credentials.role === "host"} options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }} onError={(cause) => setError(cause.message)}><BroadcastStage streamId={streamId} hostId={hostId} initialRole={credentials.role} /></LiveKitRoom>;
}
