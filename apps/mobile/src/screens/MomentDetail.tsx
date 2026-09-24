import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View, Pressable, Linking } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useNavigation, useRoute } from "@react-navigation/native";
import { api, type MomentDTO } from "../lib/api";
import { Avatar, Pill, ReactionGraph, ReactionMix, StatusRow, Loading } from "../components/ui";
import { color, type, radius, eyebrow, monoText } from "../theme";

function parseClip(url: string | null, dur: number) {
  if (!url) return null;
  const [base, frag] = url.split("#t=");
  if (!frag) return { base: url, start: 0, end: dur };
  const [s, e] = frag.split(",").map(Number);
  return { base, start: s || 0, end: e || dur };
}

export function MomentDetail() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params.id;
  const [moment, setMoment] = useState<MomentDTO | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    const load = () => api.moment(id).then((r) => setMoment(r.moment)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  const clip = moment ? parseClip(moment.clip.url, moment.clip.durationSec) : null;
  const player = useVideoPlayer(clip?.base ?? "", (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!clip) return;
    try {
      player.currentTime = clip.start;
      player.play();
    } catch {}
  }, [clip?.base, clip?.start]);

  if (!moment) return <Loading />;
  const s = moment.settlement;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View style={{ aspectRatio: 4 / 5, backgroundColor: "#000", borderRadius: radius.lg, overflow: "hidden", borderColor: color.border, borderWidth: 1 }}>
        {clip && moment.clip.ready ? (
          <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: color.textMuted }}>Building your Moment…</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={moment.creator?.displayName ?? "?"} url={moment.creator?.avatarUrl} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: color.text, ...type.h3 }}>{moment.creator?.displayName}</Text>
          <Text numberOfLines={1} style={{ color: color.textMuted, ...type.bodysm }}>{moment.streamTitle}</Text>
        </View>
        {moment.isLiveStream ? <Pill tone="live">LIVE</Pill> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: color.textMuted, ...eyebrow(11) }}>Why this became a Moment</Text>
        <View style={{ backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 12 }}>
          <ReactionGraph durationSec={moment.clip.durationSec} peakOffsetSec={moment.metrics.peakOffsetSec} total={moment.metrics.totalReactions} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <ReactionMix mix={moment.metrics.mix} />
            <Text style={{ color: color.textSecondary, ...type.bodysm }}>{moment.metrics.totalReactions} reactions</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: color.textMuted, ...eyebrow(11) }}>Founding curators</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row" }}>
            {moment.foundingCurators.slice(0, 5).map((c: any, i: number) => (
              <View key={i} style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: color.surface1, borderRadius: 16 }}>
                <Avatar name={c.displayName} url={c.avatarUrl} size={28} />
              </View>
            ))}
          </View>
          <Text style={{ color: color.textSecondary, ...type.body }}>{moment.foundingCuratorCount} people found it first</Text>
        </View>
      </View>

      {s ? (
        <View style={{ backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: color.text, ...type.h3 }}>{s.totalUsd}</Text>
              <Text style={{ color: color.textMuted, ...eyebrow(11) }}>Total reward · {moment.statusLabel}</Text>
            </View>
            <StatusRow status={s.status} />
          </View>
          <Pressable onPress={() => setShowReceipt((v) => !v)}>
            <Text style={{ color: color.electric, ...eyebrow(11) }}>{showReceipt ? "Hide" : "View"} onchain receipt</Text>
          </Pressable>
          {showReceipt ? (
            <View style={{ backgroundColor: color.surface2, borderRadius: radius.sm, padding: 12, gap: 6 }}>
              <Row k="Network" v={s.network} />
              <Row k="Status" v={s.status === "confirmed" ? "Confirmed" : s.status} />
              <Row k="Transaction" v={s.txHash ? `${s.txHash.slice(0, 8)}…${s.txHash.slice(-4)}` : "—"} />
              <Row k="Mode" v={s.onchain ? "Onchain" : "Simulation"} />
              {s.explorerUrl ? (
                <Pressable onPress={() => Linking.openURL(s.explorerUrl)}>
                  <Text style={{ color: color.electric, ...type.bodysm }}>Open in explorer →</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {moment.isLiveStream ? (
        <Pressable onPress={() => nav.navigate("Live", { id: moment.streamId })} style={{ backgroundColor: color.brand, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", ...eyebrow(12) }}>Join live</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, paddingBottom: 12 }}>
        <Pressable onPress={() => Alert.alert("Report this Moment?", "ENNOIA moderators will review it.", [
          { text: "Cancel", style: "cancel" },
          { text: "Report", style: "destructive", onPress: () => { void api.report("moment", moment.id, "inappropriate-content"); } },
        ])}>
          <Text style={{ color: color.textMuted, ...type.bodysm }}>Report</Text>
        </Pressable>
        {moment.creator ? (
          <Pressable onPress={() => Alert.alert("Block this creator?", "Their streams and Moments will be hidden from your feeds.", [
            { text: "Cancel", style: "cancel" },
            { text: "Block", style: "destructive", onPress: () => { void api.blockUser(moment.creator!.id).then(() => nav.goBack()); } },
          ])}>
            <Text style={{ color: color.textMuted, ...type.bodysm }}>Block creator</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: color.textMuted, ...monoText(13) }}>{k}</Text>
      <Text style={{ color: color.textSecondary, ...monoText(13) }}>{v}</Text>
    </View>
  );
}
