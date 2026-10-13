import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl, FlatList, TextInput } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { api, type FeedItemDTO, type CommunityDTO, type MomentDTO, type StreamDTO, type TrendingResponse, type LeaderboardResponse } from "../lib/api";
import { realtime } from "../lib/realtime";
import { Avatar, Pill, EmptyState, ReactionGraph, ReactionMix, SectionIndex } from "../components/ui";
import { color, type, radius, eyebrow } from "../theme";
import { PostCard } from "../components/post-card";

type Tab = "for-you" | "following" | "communities";

/** Live feed card — an ENNOIA post card that happens to be LIVE (matches the web StreamCard). */
function StreamFeedCard({ stream, onPress }: { stream: StreamDTO; onPress: () => void }) {
  const host = stream.creator?.displayName ?? "Host";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Join ${host}'s live stream: ${stream.title}`} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 12 }}>
        <Avatar name={host} url={stream.creator?.avatarUrl} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: color.text, ...type.body, fontWeight: "700" }}>{host}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, backgroundColor: color.error }} />
            <Text style={{ color: color.error, ...eyebrow(10) }}>Live now</Text>
          </View>
        </View>
        <Text style={{ color: color.lime, ...eyebrow(10) }}>Join →</Text>
      </View>
      <View style={{ aspectRatio: 16 / 9, backgroundColor: color.night, marginTop: 10 }}>
        {stream.thumbnailUrl ? <Image source={{ uri: stream.thumbnailUrl }} style={{ width: "100%", height: "100%" }} /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: color.textMuted, ...eyebrow(10) }}>● Live video</Text></View>}
        <View style={{ position: "absolute", left: 10, top: 10 }}><Pill tone="live">LIVE</Pill></View>
        <View style={{ position: "absolute", right: 10, top: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: "#fff", ...eyebrow(10) }}>👁 {stream.viewerCount}</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ color: color.text, ...type.body, fontWeight: "700" }}>{stream.title}</Text>
      </View>
    </Pressable>
  );
}

export function Home() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<Tab>("for-you");
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [member, setMember] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItemDTO[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trending, setTrending] = useState<TrendingResponse | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardResponse | null>(null);
  const viewed = useRef(new Set<string>());
  const mode = tab === "following" ? "following" : "for-you";
  const selectedCommunity = tab === "communities" ? communityId ?? undefined : undefined;

  const load = useCallback(async () => {
    try {
      const feed = await api.feed(mode, undefined, selectedCommunity);
      setItems(feed.items); setNextBefore(feed.nextBefore); setError(null);
    } catch { setError("Feed could not refresh. Try again."); }
  }, [mode, selectedCommunity]);
  useEffect(() => {
    setItems(null); setError(null);
  }, [mode, selectedCommunity]);
  useFocusEffect(useCallback(() => {
    void load();
    realtime.connect();
    realtime.subscribe("feed");
    const off = realtime.on((event) => {
      if (event.t === "feed") void load();
    });
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      clearInterval(timer);
      off();
      realtime.unsubscribe("feed");
    };
  }, [load]));
  useEffect(() => { void api.communities().then((result) => setCommunities(result.communities)).catch(() => setCommunityError("Could not load communities.")); }, []);
  const refreshOnchain = useCallback(() => {
    void api.trending().then(setTrending).catch(() => setTrending(null));
    void api.leaderboard().then(setLeaders).catch(() => setLeaders(null));
  }, []);
  useFocusEffect(useCallback(() => { refreshOnchain(); }, [refreshOnchain]));
  useEffect(() => {
    if (!communityId) { setMember(false); return; }
    void api.community(communityId).then((result) => setMember(result.community.member)).catch(() => setMember(false));
  }, [communityId]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.feed(mode, nextBefore, selectedCommunity);
      setItems((current) => [...(current ?? []), ...page.items.filter((candidate) => !current?.some((item) => `${item.type}:${item.post?.id ?? item.stream?.id ?? item.moment?.id}` === `${candidate.type}:${candidate.post?.id ?? candidate.stream?.id ?? candidate.moment?.id}`))]);
      setNextBefore(page.nextBefore); setError(null);
    } catch { setError("Could not load more. Try again."); }
    finally { setLoadingMore(false); }
  };
  const createCommunity = async () => {
    if (!communityName.trim()) return;
    try {
      const result = await api.createCommunity(communityName.trim(), communityDescription.trim());
      setCommunities((current) => [result.community, ...current]); setCommunityId(result.community.id); setMember(true);
      setCommunityName(""); setCommunityDescription(""); setCommunityError(null);
    } catch (cause) { setCommunityError(cause instanceof Error ? cause.message : "Could not create community."); }
  };
  const toggleMembership = async () => {
    if (!communityId) return;
    try { if (member) await api.leaveCommunity(communityId); else await api.joinCommunity(communityId); setMember(!member); setCommunityError(null); }
    catch { setCommunityError("Could not update membership. Try again."); }
  };
  const onVisible = useRef(({ viewableItems }: { viewableItems: Array<{ item: FeedItemDTO }> }) => {
    for (const { item } of viewableItems) {
      if (item.type === "post" && item.post && !viewed.current.has(item.post.id)) {
        viewed.current.add(item.post.id);
        void api.viewPost(item.post.id).catch(() => viewed.current.delete(item.post!.id));
      }
    }
  }).current;
  const selected = communities.find((community) => community.id === communityId);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: color.night }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
      data={items ?? []}
      keyExtractor={(item) => `${item.type}:${item.post?.id ?? item.stream?.id ?? item.moment?.id}`}
      onViewableItemsChanged={onVisible}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); refreshOnchain(); setRefreshing(false); }} tintColor={color.lime} />}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: color.lime, ...eyebrow(10) }}>Your world, live</Text><Text style={{ color: color.text, ...type.h1 }}>Feed</Text></View><Pressable accessibilityRole="button" onPress={() => nav.navigate("GoLive")} style={{ borderWidth: 1, borderColor: color.lime, padding: 10 }}><Text style={{ color: color.lime, ...eyebrow(10) }}>Go live</Text></Pressable></View>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1 }}>{(["for-you", "following", "communities"] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: tab === item ? color.surface2 : color.surface1 }}><Text style={{ color: tab === item ? color.lime : color.textSecondary, ...eyebrow(10) }}>{item === "for-you" ? "For You" : item}</Text></Pressable>)}</View>
        {tab === "communities" ? <View style={{ backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, padding: 12, gap: 10 }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Pressable onPress={() => setCommunityId(null)} style={{ borderWidth: 1, borderColor: !communityId ? color.lime : color.border, padding: 8 }}><Text style={{ color: !communityId ? color.lime : color.textSecondary, ...eyebrow(10) }}>Discover</Text></Pressable>{communities.map((community) => <Pressable key={community.id} onPress={() => setCommunityId(community.id)} style={{ borderWidth: 1, borderColor: communityId === community.id ? color.lime : color.border, padding: 8 }}><Text style={{ color: communityId === community.id ? color.lime : color.textSecondary, ...eyebrow(10) }}>{community.name}</Text></Pressable>)}</ScrollView>{selected ? <View style={{ gap: 6 }}><Text style={{ color: color.text, ...type.h3 }}>{selected.name}</Text><Text style={{ color: color.textSecondary, ...type.bodysm }}>{selected.description} · {selected.memberCount} members</Text><Pressable onPress={() => void toggleMembership()} style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: color.border, padding: 8 }}><Text style={{ color: color.text, ...eyebrow(10) }}>{member ? "Leave" : "Join"}</Text></Pressable></View> : <View style={{ gap: 8 }}><Text style={{ color: color.textSecondary, ...type.bodysm }}>Public communities are open to discover. Join one to post there.</Text><TextInput placeholder="Community name" placeholderTextColor={color.textMuted} value={communityName} onChangeText={setCommunityName} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, padding: 10 }} /><TextInput placeholder="Description" placeholderTextColor={color.textMuted} value={communityDescription} onChangeText={setCommunityDescription} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, padding: 10 }} /><Pressable onPress={() => void createCommunity()} style={{ backgroundColor: color.brand, padding: 10, alignItems: "center" }}><Text style={{ color: color.text, ...eyebrow(10) }}>Create community</Text></Pressable></View>}{communityError ? <Text selectable style={{ color: color.error, ...type.bodysm }}>{communityError}</Text> : null}</View> : null}
        {tab !== "communities" || (communityId && member) ? <Pressable accessibilityRole="button" onPress={() => nav.navigate("CreatePost", { communityId: selectedCommunity })} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ width: 8, height: 8, backgroundColor: color.lime }} /><Text style={{ color: color.textSecondary, ...type.body }}>What's happening?</Text><Text style={{ marginLeft: "auto", color: color.lime, ...eyebrow(10) }}>Post</Text></Pressable> : null}
        {tab === "for-you" && <View accessibilityLabel="Onchain activity" style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 14, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: color.text, ...type.h3 }}>Onchain activity</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh onchain activity" onPress={refreshOnchain}><Text style={{ color: color.lime, ...eyebrow(10) }}>Refresh</Text></Pressable></View>
          <Text style={{ color: color.textSecondary, ...type.bodysm }}>{trending?.source === "envio" ? "Moments indexed from Monad by Envio" : "Recent Moments from ENNOIA · indexed activity unavailable"}</Text>
          {(trending?.moments ?? []).slice(0, 3).map((moment) => "clip" in moment
            ? <Pressable key={moment.id} accessibilityRole="button" onPress={() => nav.navigate("MomentDetail", { id: moment.id })} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 10 }}><Text style={{ color: color.text, ...type.bodysm }}>{moment.streamTitle} · {moment.foundingCuratorCount} founding curators →</Text></Pressable>
            : <View key={moment.id} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 10 }}><Text style={{ color: color.text, ...type.bodysm }}>Monad Moment {moment.id.slice(0, 10)}… · {moment.foundingCuratorCount} founding curators · {moment.settled ? "settled" : "pending"}</Text></View>)}
          {trending && trending.moments.length === 0 && <Text style={{ color: color.textMuted, ...type.bodysm }}>No onchain Moments yet.</Text>}
          {leaders && leaders.entries.length > 0 && <View style={{ borderTopWidth: 1, borderColor: color.border, paddingTop: 8, gap: 4 }}><Text style={{ color: color.textMuted, ...eyebrow(10) }}>{leaders.source === "envio" ? "Top scouts · Monad indexed" : "Top scouts · local activity"}</Text>{leaders.entries.slice(0, 3).map((entry) => <Text key={`${entry.rank}:${entry.walletAddress ?? entry.displayName}`} style={{ color: color.textSecondary, ...type.bodysm }}>#{entry.rank} {entry.displayName ?? (entry.walletAddress ? `${entry.walletAddress.slice(0, 6)}…${entry.walletAddress.slice(-4)}` : "Scout")} · {entry.firstFinds} first finds</Text>)}</View>}
        </View>}
        {error ? <Pressable onPress={() => void load()} style={{ borderWidth: 1, borderColor: color.error, padding: 10 }}><Text selectable style={{ color: color.error, ...type.bodysm }}>{error} Tap to retry.</Text></Pressable> : null}
      </View>}
      renderItem={({ item }) => item.type === "post" && item.post ? <PostCard post={item.post} onChanged={() => void load()} onOpen={() => nav.navigate("PostDetail", { id: item.post!.id })} onAuthor={(id) => nav.navigate("PublicProfile", { id })} onQuote={(id) => nav.navigate("CreatePost", { quotePostId: id })} /> : item.type === "stream" && item.stream ? <StreamFeedCard stream={item.stream} onPress={() => nav.navigate("Live", { id: item.stream!.id })} /> : item.type === "moment" && item.moment ? <MomentCard moment={item.moment} onPress={() => nav.navigate("MomentDetail", { id: item.moment!.id })} /> : null}
      ListEmptyComponent={items === null ? <View style={{ padding: 32, alignItems: "center" }}><Text style={{ color: color.textSecondary, ...type.body }}>Loading feed…</Text></View> : <EmptyState title={tab === "following" ? "Following is quiet." : tab === "communities" ? "No posts here yet." : "Your feed is just getting started."} body={tab === "following" ? "Follow people to see their posts, live streams, and Moments." : "Start a conversation or come back when something goes live."} />}
      ListFooterComponent={nextBefore ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={{ alignItems: "center", borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 12 }}><Text style={{ color: color.textSecondary, ...eyebrow(10) }}>{loadingMore ? "Loading…" : "Load more"}</Text></Pressable> : null}
    />
  );
}

export function MomentCard({ moment, onPress }: { moment: MomentDTO; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: color.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, overflow: "hidden" }}>
      <View style={{ aspectRatio: 4 / 5, backgroundColor: "#000" }}>
        {moment.creator ? (
          <View style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 2, flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Avatar name={moment.creator.displayName} url={moment.creator.avatarUrl} size={20} />
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
            <Text style={{ ...eyebrow(11), color: color.lime }}>{moment.clip.manual ? "✂ Saved clip" : `🔥 Moment · ${moment.metrics.category}`}</Text>
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
