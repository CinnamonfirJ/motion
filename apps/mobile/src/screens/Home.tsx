import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, RefreshControl, FlatList, TextInput } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { api, type FeedItemDTO, type CommunityDTO, type MomentDTO } from "../lib/api";
import { Avatar, Pill, EmptyState, ReactionGraph, ReactionMix, SectionIndex } from "../components/ui";
import { color, type, radius, eyebrow } from "../theme";
import { PostCard } from "../components/post-card";

type Tab = "for-you" | "following" | "communities";

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
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void api.communities().then((result) => setCommunities(result.communities)).catch(() => setCommunityError("Could not load communities.")); }, []);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={color.lime} />}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: color.lime, ...eyebrow(10) }}>Your world, live</Text><Text style={{ color: color.text, ...type.h1 }}>Feed</Text></View><Pressable accessibilityRole="button" onPress={() => nav.navigate("GoLive")} style={{ borderWidth: 1, borderColor: color.lime, padding: 10 }}><Text style={{ color: color.lime, ...eyebrow(10) }}>Go live</Text></Pressable></View>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1 }}>{(["for-you", "following", "communities"] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: tab === item ? color.surface2 : color.surface1 }}><Text style={{ color: tab === item ? color.lime : color.textSecondary, ...eyebrow(10) }}>{item === "for-you" ? "For You" : item}</Text></Pressable>)}</View>
        {tab === "communities" ? <View style={{ backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, padding: 12, gap: 10 }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Pressable onPress={() => setCommunityId(null)} style={{ borderWidth: 1, borderColor: !communityId ? color.lime : color.border, padding: 8 }}><Text style={{ color: !communityId ? color.lime : color.textSecondary, ...eyebrow(10) }}>Discover</Text></Pressable>{communities.map((community) => <Pressable key={community.id} onPress={() => setCommunityId(community.id)} style={{ borderWidth: 1, borderColor: communityId === community.id ? color.lime : color.border, padding: 8 }}><Text style={{ color: communityId === community.id ? color.lime : color.textSecondary, ...eyebrow(10) }}>{community.name}</Text></Pressable>)}</ScrollView>{selected ? <View style={{ gap: 6 }}><Text style={{ color: color.text, ...type.h3 }}>{selected.name}</Text><Text style={{ color: color.textSecondary, ...type.bodysm }}>{selected.description} · {selected.memberCount} members</Text><Pressable onPress={() => void toggleMembership()} style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: color.border, padding: 8 }}><Text style={{ color: color.text, ...eyebrow(10) }}>{member ? "Leave" : "Join"}</Text></Pressable></View> : <View style={{ gap: 8 }}><Text style={{ color: color.textSecondary, ...type.bodysm }}>Public communities are open to discover. Join one to post there.</Text><TextInput placeholder="Community name" placeholderTextColor={color.textMuted} value={communityName} onChangeText={setCommunityName} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, padding: 10 }} /><TextInput placeholder="Description" placeholderTextColor={color.textMuted} value={communityDescription} onChangeText={setCommunityDescription} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, padding: 10 }} /><Pressable onPress={() => void createCommunity()} style={{ backgroundColor: color.brand, padding: 10, alignItems: "center" }}><Text style={{ color: color.text, ...eyebrow(10) }}>Create community</Text></Pressable></View>}{communityError ? <Text selectable style={{ color: color.error, ...type.bodysm }}>{communityError}</Text> : null}</View> : null}
        {tab !== "communities" || (communityId && member) ? <Pressable accessibilityRole="button" onPress={() => nav.navigate("CreatePost", { communityId: selectedCommunity })} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ width: 8, height: 8, backgroundColor: color.lime }} /><Text style={{ color: color.textSecondary, ...type.body }}>What's happening?</Text><Text style={{ marginLeft: "auto", color: color.lime, ...eyebrow(10) }}>Post</Text></Pressable> : null}
        {error ? <Pressable onPress={() => void load()} style={{ borderWidth: 1, borderColor: color.error, padding: 10 }}><Text selectable style={{ color: color.error, ...type.bodysm }}>{error} Tap to retry.</Text></Pressable> : null}
      </View>}
      renderItem={({ item }) => item.type === "post" && item.post ? <PostCard post={item.post} onChanged={() => void load()} onOpen={() => nav.navigate("PostDetail", { id: item.post!.id })} onAuthor={(id) => nav.navigate("PublicProfile", { id })} onQuote={(id) => nav.navigate("CreatePost", { quotePostId: id })} /> : item.type === "stream" && item.stream ? <Pressable onPress={() => nav.navigate("Live", { id: item.stream!.id })} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1 }}><View style={{ aspectRatio: 16 / 9, backgroundColor: color.night }}>{item.stream.thumbnailUrl ? <Image source={{ uri: item.stream.thumbnailUrl }} style={{ width: "100%", height: "100%" }} /> : null}<View style={{ position: "absolute", left: 10, top: 10 }}><Pill tone="live">LIVE · {item.stream.viewerCount}</Pill></View></View><View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}><Avatar name={item.stream.creator?.displayName ?? "Host"} url={item.stream.creator?.avatarUrl} size={32} /><View style={{ flex: 1 }}><Text style={{ color: color.text, ...type.body, fontWeight: "700" }}>{item.stream.title}</Text><Text style={{ color: color.textSecondary, ...type.bodysm }}>{item.stream.creator?.displayName}</Text></View></View></Pressable> : item.type === "moment" && item.moment ? <MomentCard moment={item.moment} onPress={() => nav.navigate("MomentDetail", { id: item.moment!.id })} /> : null}
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
