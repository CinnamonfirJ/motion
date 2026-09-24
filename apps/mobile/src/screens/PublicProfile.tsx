import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { api, type PostDTO } from "../lib/api";
import { useSession } from "../session";
import { Avatar } from "../components/ui";
import { PostCard } from "../components/post-card";
import { color, eyebrow, type } from "../theme";

interface Profile { id: string; displayName: string; handle: string; avatarUrl: string | null }
interface Stats { followers: number; following: number; posts: number; followedByMe: boolean }

export function PublicProfile() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params.id as string;
  const { user: me } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    try {
      const [account, social, feed] = await Promise.all([api.publicUser(id), api.userSocial(id), api.userPosts(id)]);
      setProfile(account.user); setStats(social); setPosts(feed.posts); setError(null);
    } catch { setError("Could not load this profile."); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const toggleFollow = async () => {
    if (!stats || pending) return;
    setPending(true);
    try { if (stats.followedByMe) await api.unfollow(id); else await api.follow(id); await load(); }
    catch { setError("Could not update your follow. Try again."); }
    finally { setPending(false); }
  };
  return <FlatList
    style={{ flex: 1, backgroundColor: color.night }}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    data={posts ?? []}
    keyExtractor={(item) => item.id}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      {profile && stats ? <View style={{ padding: 16, backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Avatar name={profile.displayName} url={profile.avatarUrl} size={56} /><View style={{ flex: 1 }}><Text style={{ color: color.text, ...type.h2 }}>{profile.displayName}</Text><Text style={{ color: color.textMuted, ...type.bodysm }}>@{profile.handle}</Text></View></View>
        <View style={{ flexDirection: "row", gap: 18, borderTopWidth: 1, borderColor: color.border, paddingTop: 12 }}><Text style={{ color: color.textSecondary, ...eyebrow(10) }}>{stats.posts} posts</Text><Text style={{ color: color.textSecondary, ...eyebrow(10) }}>{stats.followers} followers</Text><Text style={{ color: color.textSecondary, ...eyebrow(10) }}>{stats.following} following</Text></View>
        {me?.id !== id ? <Pressable accessibilityRole="button" disabled={pending} onPress={() => void toggleFollow()} style={{ backgroundColor: stats.followedByMe ? color.surface2 : color.brand, borderWidth: stats.followedByMe ? 1 : 0, borderColor: color.border, padding: 12, alignItems: "center", opacity: pending ? 0.5 : 1 }}><Text style={{ color: color.text, ...eyebrow(11) }}>{stats.followedByMe ? "Following ✓" : "Follow"}</Text></Pressable> : null}
      </View> : <Text style={{ color: color.textSecondary, ...type.body }}>{error ?? "Loading profile…"}</Text>}
      {error && profile ? <Pressable accessibilityRole="button" onPress={() => void load()}><Text accessibilityRole="alert" style={{ color: color.error, ...type.bodysm }}>{error} Tap to retry.</Text></Pressable> : null}
    </View>}
    renderItem={({ item }) => <PostCard post={item} onChanged={() => void load()} onOpen={() => nav.navigate("PostDetail", { id: item.id })} onAuthor={(userId) => nav.navigate("PublicProfile", { id: userId })} onQuote={(postId) => nav.navigate("CreatePost", { quotePostId: postId })} />}
    ListEmptyComponent={posts ? <Text style={{ color: color.textMuted, ...type.bodysm }}>No posts yet.</Text> : null}
  />;
}
