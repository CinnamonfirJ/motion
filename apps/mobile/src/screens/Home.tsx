import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, type StreamDTO, type MomentDTO } from "../lib/api";
import { Avatar, Pill, EmptyState, ReactionGraph, ReactionMix, SectionIndex } from "../components/ui";
import { color, type, radius, eyebrow } from "../theme";

export function Home() {
  const nav = useNavigation<any>();
  const [streams, setStreams] = useState<StreamDTO[]>([]);
  const [moments, setMoments] = useState<MomentDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [s, m] = await Promise.all([api.streams().catch(() => ({ streams: [] })), api.moments().catch(() => ({ moments: [] }))]);
    setStreams(s.streams);
    setMoments(m.moments);
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.night }}
      contentContainerStyle={{ padding: 16, gap: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={color.lime} />}
    >
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: color.text, ...type.h2 }}>Live now</Text>
          <SectionIndex index={1} label="Streams" />
        </View>
        {streams.length === 0 ? (
          <EmptyState title="Quiet right now." body="Fresh Moments are still waiting below." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {streams.map((s) => (
              <Pressable key={s.id} onPress={() => nav.navigate("Live", { id: s.id })} style={{ width: 240, backgroundColor: color.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: "hidden" }}>
                <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000" }}>
                  {s.thumbnailUrl ? <Image source={{ uri: s.thumbnailUrl }} style={{ width: "100%", height: "100%" }} /> : null}
                  <View style={{ position: "absolute", top: 8, left: 8, flexDirection: "row", gap: 6 }}>
                    <Pill tone="live">LIVE · {s.viewerCount}</Pill>
                  </View>
                </View>
                <View style={{ padding: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Avatar name={s.creator?.displayName ?? "?"} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: color.text, ...type.bodysm, fontWeight: "600" }}>{s.creator?.displayName}</Text>
                    <Text numberOfLines={1} style={{ color: color.textMuted, ...type.micro }}>{s.title}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: color.text, ...type.h2 }}>Moments</Text>
          <SectionIndex index={2} label="Feed" />
        </View>
        {moments.length === 0 ? (
          <EmptyState title="Nothing has spiked yet." body="When the crowd catches something, it'll appear here." />
        ) : (
          moments.map((m) => <MomentCard key={m.id} moment={m} onPress={() => nav.navigate("MomentDetail", { id: m.id })} />)
        )}
      </View>
    </ScrollView>
  );
}

export function MomentCard({ moment, onPress }: { moment: MomentDTO; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: color.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: "hidden" }}>
      <View style={{ aspectRatio: 4 / 5, backgroundColor: "#000" }}>
        {moment.creator ? (
          <View style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 2, flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Avatar name={moment.creator.displayName} size={20} />
              <Text style={{ color: color.text, ...type.label }}>{moment.creator.displayName}</Text>
            </View>
            {moment.isLiveStream ? <Pill tone="live">LIVE</Pill> : null}
          </View>
        ) : null}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: color.textMuted, ...type.bodysm }}>{moment.clip.ready ? "▶ Moment" : "Building your Moment…"}</Text>
        </View>
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 12 }}>
          <Text numberOfLines={1} style={{ color: color.text, ...type.body, fontWeight: "600" }}>{moment.streamTitle}</Text>
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ borderWidth: 1, borderColor: "rgba(140,100,255,0.4)", backgroundColor: "rgba(140,100,255,0.1)", paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ ...eyebrow(11), color: color.lime }}>🔥 Moment · {moment.metrics.category}</Text>
          </View>
          {moment.foundingCuratorCount > 0 ? (
            <View style={{ borderWidth: 1, borderColor: "rgba(240,220,160,0.4)", backgroundColor: "rgba(240,220,160,0.1)", paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ ...eyebrow(11), color: color.curatorGold }}>★ {moment.foundingCuratorCount} founding</Text>
            </View>
          ) : null}
        </View>
        <ReactionGraph durationSec={moment.clip.durationSec} peakOffsetSec={moment.metrics.peakOffsetSec} total={moment.metrics.totalReactions} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <ReactionMix mix={moment.metrics.mix} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: color.textSecondary, ...eyebrow(11) }}>{moment.metrics.totalReactions} reactions · {moment.foundingCuratorCount} founding</Text>
          {moment.isLiveStream ? <Text style={{ color: color.lime, ...eyebrow(11) }}>Join live →</Text> : <Pill>Moment</Pill>}
        </View>
      </View>
    </Pressable>
  );
}
