import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, AppState, Modal, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useNavigation, useRoute } from "@react-navigation/native";
import { streamPositionSec, streamTimeMs, newEventId, ordinalRank } from "./_shared";
import { api, type StreamDTO, type SyncDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { Avatar, Pill, Loading } from "../components/ui";
import { color, type, radius, REACTION_ICON, eyebrow } from "../theme";

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
  const sync = useRef<SyncDTO | null>(null);
  const [viewers, setViewers] = useState(0);
  const [heatingUp, setHeatingUp] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [forming, setForming] = useState(false);
  const [celebration, setCelebration] = useState<{ rank: number; rewardUsd: string; momentId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    (async () => {
      await realtime.syncClock();
      const r = await api.stream(id);
      if (!alive) return;
      setStream(r.stream);
      sync.current = r.sync;
      setViewers(r.stream.viewerCount);
    })().catch(() => nav.goBack());
    realtime.connect();
    realtime.subscribe(id);
    return () => {
      alive = false;
      realtime.unsubscribe(id);
    };
  }, [id]);

  // Seek to authoritative position + resync on foreground (PRD §35 backgrounding).
  useEffect(() => {
    if (!stream) return;
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
    });
  }, [id]);

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
      await api.react(id, t, clientStreamTimeMs, newEventId(), "ios");
    } catch {}
  };

  if (!stream) return <Loading label="Joining live…" />;
  const H = Math.min(Dimensions.get("window").height * 0.62, 640);

  return (
    <View style={{ flex: 1, backgroundColor: color.night }}>
      <View style={{ height: H, backgroundColor: "#000" }}>
        <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
        <SafeAreaView style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable onPress={() => nav.goBack()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: color.text, fontSize: 18 }}>←</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Avatar name={stream.creator?.displayName ?? "?"} size={24} />
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

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
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
          <Pressable
            onPress={async () => {
              try {
                const r = await api.tip(id);
                setToast(`Tip sent · ${r.amountUsd}`);
              } catch {
                setToast("Tip is taking longer than expected.");
              }
            }}
            style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ ...eyebrow(11), color: color.textSecondary }}>♥ Tip</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              try {
                const s = sync.current;
                const at = s ? streamTimeMs(s.startedAt, realtime.serverNow()) : 0;
                await api.clip(id, at);
                setToast("Clip saved to your finds");
              } catch {
                setToast("Clip is still processing.");
              }
            }}
            style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ ...eyebrow(11), color: color.textSecondary }}>✂ Clip it</Text>
          </Pressable>
        </View>
        <Text style={{ color: color.textMuted, ...type.micro }}>Tap to react</Text>
      </View>
      {toast ? (
        <View style={{ position: "absolute", bottom: 100, alignSelf: "center", borderWidth: 1, borderColor: color.success, backgroundColor: color.surface2, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: color.text, ...type.body }}>{toast}</Text>
        </View>
      ) : null}

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
