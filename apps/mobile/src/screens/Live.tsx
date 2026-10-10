import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, AppState, Modal, Share, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useNavigation, useRoute } from "@react-navigation/native";
import { streamPositionSec, streamTimeMs, newEventId, ordinalRank } from "./_shared";
import { api, type StreamDTO, type SyncDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { Avatar, Pill, Loading } from "../components/ui";
import { color, type, radius, REACTION_ICON, eyebrow } from "../theme";
import { LiveKitStage } from "../components/livekit-stage";
import { LiveChat } from "../components/live-chat";
import { useSession } from "../session";
import { sendReaction } from "../lib/reaction-queue";
import { ArrowLeft, Radio, MessageSquare, Share2, Heart, Scissors, UserPlus, Check, type LucideIcon } from "lucide-react-native";

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || "https://ennoia-app.vercel.app";

/** Sharp icon+label action button — matches the studio/web live buttons. */
function StageBtn({ label, Icon, onPress, accessibilityLabel, filled }: { label: string; Icon: LucideIcon; onPress: () => void; accessibilityLabel?: string; filled?: boolean }) {
  const fg = filled ? "#FFFFFF" : color.textSecondary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: filled ? color.brand : color.border, backgroundColor: filled ? color.brand : color.surface2, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.85 : 1 })}>
      <Icon size={14} color={fg} strokeWidth={1.8} />
      <Text style={{ ...eyebrow(11), color: fg }}>{label}</Text>
    </Pressable>
  );
}

const REACTIONS = [
  { type: "fire", label: "React fire" },
  { type: "laugh", label: "React laugh" },
  { type: "wow", label: "React wow" },
] as const;

export function Live() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params.id;
  const [stream, setStream] = useState<StreamDTO | null>(null);
  const [joinError, setJoinError] = useState(false);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const sync = useRef<SyncDTO | null>(null);
  const [viewers, setViewers] = useState(0);
  const [heatingUp, setHeatingUp] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [forming, setForming] = useState(false);
  const [celebration, setCelebration] = useState<{ rank: number; rewardUsd: string; momentId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { sendTransaction, user } = useSession();
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const player = useVideoPlayer(stream?.videoUrl ?? "", (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setStream(null);
    setJoinError(false);
    setEnded(false);
    (async () => {
      // The stream response already includes a sync snapshot; clock refinement must not block joining.
      void realtime.syncClock().catch(() => {});
      const r = await api.stream(id, controller.signal);
      if (!alive) return;
      setStream(r.stream);
      sync.current = r.sync;
      setViewers(r.stream.viewerCount);
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

  // Seek to authoritative position + resync on foreground (PRD §35 backgrounding).
  useEffect(() => {
    if (!stream || stream.mode !== "vod") return;
    const seek = () => {
      const s = sync.current;
      if (!s) return;
      const pos = streamPositionSec(s.startedAt, s.durationSec, realtime.serverNow());
      try {
        player.currentTime = pos;
        player.play();
      } catch {}
    };
    seek();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") realtime.syncClock().then(seek);
    });
    const iv = setInterval(seek, 5000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [stream]);

  useEffect(() => {
    return realtime.on((ev) => {
      if (ev.streamId && ev.streamId !== id && ev.t !== "curator" && ev.t !== "settlement") return;
      if (ev.t === "activity") setHeatingUp(ev.heatingUp);
      else if (ev.t === "viewers") setViewers(ev.count);
      else if (ev.t === "moment_detected") setDetecting(true);
      else if (ev.t === "moment") {
        if (["CONFIRMED", "CLIPPING", "SETTLING"].includes(ev.state)) setForming(true);
        if (["PUBLISHED", "SETTLED", "EXPIRED"].includes(ev.state)) setForming(false);
      } else if (ev.t === "curator") setCelebration({ rank: ev.rank, rewardUsd: ev.rewardUsd ?? "$0.00", momentId: ev.momentId });
      else if (ev.t === "live_room") api.stream(id).then((r) => { setStream(r.stream); if (!r.stream.isLive) setEnded(true); }).catch(() => {});
    });
  }, [id]);

  // Follow state for the viewer's Follow control.
  useEffect(() => {
    const creatorId = stream?.creator?.id;
    if (!creatorId || creatorId === user?.id) { setFollowed(null); return; }
    let alive = true;
    api.userSocial(creatorId).then((s) => { if (alive) setFollowed(s.followedByMe); }).catch(() => {});
    return () => { alive = false; };
  }, [stream?.creator?.id, user?.id]);

  useEffect(() => {
    if (!detecting) return;
    const t = setTimeout(() => {
      setDetecting(false);
      setForming(true);
    }, 2600);
    return () => clearTimeout(t);
  }, [detecting]);

  const react = async (t: string) => {
    const s = sync.current;
    const clientStreamTimeMs = s ? streamTimeMs(s.startedAt, realtime.serverNow()) : 0;
    try {
      const result = await sendReaction({ streamId: id, type: t, clientStreamTimeMs, eventId: newEventId(), platform: process.env.EXPO_OS === "android" ? "android" : "ios" });
      if (result === "queued") setToast("Reaction saved — it will send when you're back online.");
    } catch {}
  };

  const share = async () => {
    try { await Share.share({ message: `${stream?.title ?? "Live on ENNOIA"} — ${WEB_URL}/live/${id}` }); } catch {}
  };
  const toggleFollow = async () => {
    const creatorId = stream?.creator?.id;
    if (!creatorId || followed === null) return;
    const next = !followed;
    setFollowed(next);
    try { if (next) await api.follow(creatorId); else await api.unfollow(creatorId); }
    catch { setFollowed(!next); setToast("Couldn't update follow. Try again in a moment."); }
  };

  if (!stream) return joinError
    ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: color.night }}><Text style={{ color: color.textSecondary, ...type.body }}>The stream is taking too long to load.</Text><Pressable accessibilityRole="button" onPress={() => setJoinAttempt((attempt) => attempt + 1)} style={{ borderWidth: 1, borderColor: color.lime, padding: 12 }}><Text style={{ color: color.lime, ...eyebrow(11) }}>Retry joining</Text></Pressable></View>
    : <Loading label="Joining live…" />;

  if (ended) return (
    <View style={{ flex: 1, backgroundColor: color.night, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
      <Pill tone="live">ENDED</Pill>
      <Text style={{ color: color.text, ...type.h2, textAlign: "center" }}>This stream has ended</Text>
      <Text style={{ color: color.textSecondary, ...type.body, textAlign: "center" }}>{stream.creator?.displayName ?? "The host"} isn't live right now. Catch the Moments they made, or head back to the feed.</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Pressable onPress={() => nav.navigate("Tabs", { screen: "MomentsTab" })} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ color: color.text, ...eyebrow(11) }}>View Moments</Text></Pressable>
        <Pressable onPress={() => nav.goBack()} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ color: color.text, ...eyebrow(11) }}>Back to feed</Text></Pressable>
      </View>
    </View>
  );

  const isHost = stream.creator?.id === user?.id;
  const H = Math.min(height * (isHost ? 0.72 : 0.58), isHost ? 760 : 620);

  return (
    <View style={{ flex: 1, backgroundColor: color.night }}>
      <View style={{ height: H, backgroundColor: "#000" }}>
        {stream.mode === "vod" ? (
          <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
        ) : <LiveKitStage streamId={stream.id} hostId={stream.creator?.id ?? ""} />}
        <SafeAreaView style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable onPress={() => nav.goBack()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                <ArrowLeft size={18} color={color.text} strokeWidth={2} />
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Avatar name={stream.creator?.displayName ?? "?"} url={stream.creator?.avatarUrl} size={24} />
                <Text style={{ color: color.text, ...type.label }}>{stream.creator?.displayName}</Text>
              </View>
            </View>
            <Pill tone="live">LIVE · {viewers}</Pill>
          </View>
        </SafeAreaView>

        {forming && !detecting ? (
          <View style={{ position: "absolute", top: 72, alignSelf: "center", backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: color.textSecondary, ...eyebrow(11) }}>Moment forming · Checking the crowd</Text>
          </View>
        ) : null}

        {detecting ? (
          <View accessibilityLiveRegion="assertive" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(140,100,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color.lime }} />
            </View>
            <Text style={{ color: color.text, ...type.h1 }}>MOMENT DETECTED</Text>
            <Text style={{ color: color.textSecondary, ...type.body, marginTop: 4 }}>People are reacting fast.</Text>
          </View>
        ) : null}
      </View>

      {isHost ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End live stream"
          onPress={async () => {
            try {
              setToast("Finishing queued clips before ending the stream…");
              await api.endStream(id);
              nav.goBack();
            } catch {
              setToast("The stream could not be ended yet. Try again.");
            }
          }}
          style={{ position: "absolute", top: 116, right: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: color.error, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Radio size={14} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ color: "#FFFFFF", ...eyebrow(11) }}>End live</Text>
        </Pressable>
      ) : null}

      {isHost ? <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16, gap: 12 }}><Text style={{ color: color.textSecondary, ...eyebrow(11) }}>You are hosting · {viewers} watching</Text>{stream.mode === "livekit" && stream.recording === false ? <View accessibilityRole="text" style={{ borderWidth: 1, borderColor: color.warning, backgroundColor: color.surface2, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: color.warning, ...eyebrow(10) }}>⦿ Not recording · clips won't save</Text></View> : null}<View style={{ flexDirection: "row", gap: 12 }}><StageBtn label="Chat" Icon={MessageSquare} onPress={() => setChatOpen(true)} accessibilityLabel="Open live chat" /><StageBtn label="Share" Icon={Share2} onPress={() => void share()} accessibilityLabel="Share stream" /></View></View> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        {heatingUp ? <Text style={{ color: color.lime, ...eyebrow(11) }}>● Heating up</Text> : <View style={{ height: 16 }} />}
        <View style={{ flexDirection: "row", gap: 16 }}>
          {REACTIONS.map((r) => (
            <Pressable
              key={r.type}
              accessibilityLabel={r.label}
              onPress={() => react(r.type)}
              style={({ pressed }) => [{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.9 : 1 }] }]}
            >
              <Text style={{ fontSize: 30 }}>{REACTION_ICON[r.type as keyof typeof REACTION_ICON]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StageBtn label="Tip" Icon={Heart} onPress={async () => {
            try { const r = await api.tip(id); await sendTransaction(r.transaction); setToast(`Tip sent · ${r.amountUsd}`); }
            catch { setToast("Your tip needs a moment — still going through."); }
          }} />
          <StageBtn label="Clip it" Icon={Scissors} onPress={async () => {
            try { const s = sync.current; const at = s ? streamTimeMs(s.startedAt, realtime.serverNow()) : 0; await api.clip(id, at); setToast("35-second clip queued — it will appear on Home after the stream ends."); }
            catch { setToast("Couldn't queue the clip. Check that this stream is recording and try again."); }
          }} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StageBtn label="Chat" Icon={MessageSquare} onPress={() => setChatOpen(true)} accessibilityLabel="Open live chat" />
          <StageBtn label="Share" Icon={Share2} onPress={() => void share()} accessibilityLabel="Share stream" />
          {followed !== null ? (
            <StageBtn label={followed ? "Following" : "Follow"} Icon={followed ? Check : UserPlus} filled={!followed} onPress={() => void toggleFollow()} accessibilityLabel={followed ? "Following" : "Follow creator"} />
          ) : null}
        </View>
        <Text style={{ color: color.textMuted, ...type.micro }}>Tap to react</Text>
      </View>}
      {toast ? (
        <View style={{ position: "absolute", bottom: 100, alignSelf: "center", borderWidth: 1, borderColor: color.success, backgroundColor: color.surface2, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: color.text, ...type.body }}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={chatOpen} transparent animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" }}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="Close chat" onPress={() => setChatOpen(false)} />
          <SafeAreaView edges={["bottom"]} style={{ height: "62%", backgroundColor: color.surface1 }}>
            <LiveChat streamId={id} isHost={isHost} onlineCount={viewers} onClose={() => setChatOpen(false)} />
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={!!celebration} transparent animationType="fade">
        {celebration ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,7,8,0.8)", padding: 24 }}>
            <View style={{ width: "100%", maxWidth: 360, backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.xl, padding: 32, alignItems: "center" }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.celebration[1], alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" }} />
              </View>
              <Text accessibilityLiveRegion="assertive" style={{ color: color.text, ...type.h1, textAlign: "center" }}>You found it early.</Text>
              <Text style={{ color: color.lime, ...type.h3, marginTop: 8 }}>Founding Curator {ordinalRank(celebration.rank)}</Text>
              <Text style={{ color: color.textSecondary, ...type.body, marginTop: 12, textAlign: "center" }}>Your reaction helped surface this Moment.</Text>
              <View style={{ marginTop: 20, backgroundColor: color.surface2, borderRadius: radius.md, borderColor: color.border, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: color.text, ...type.h2 }}>{celebration.rewardUsd}</Text>
                <Text style={{ color: color.warning, ...eyebrow(11), marginTop: 2 }}>○ Settling</Text>
              </View>
              <View style={{ marginTop: 24, width: "100%", gap: 8 }}>
                <Pressable onPress={() => { const c = celebration; setCelebration(null); nav.navigate("MomentDetail", { id: c.momentId }); }} style={{ backgroundColor: color.brand, borderRadius: radius.sm, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#FFFFFF", ...eyebrow(12) }}>Watch Moment</Text>
                </Pressable>
                <Pressable onPress={() => setCelebration(null)} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: color.textSecondary }}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </View>
  );
}
