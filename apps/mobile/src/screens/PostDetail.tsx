import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { api, type PostDTO } from "../lib/api";
import { PostCard } from "../components/post-card";
import { color, eyebrow, type } from "../theme";

export function PostDetail() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params.id as string;
  const [post, setPost] = useState<PostDTO | null>(null);
  const [replies, setReplies] = useState<PostDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const load = useCallback(async () => {
    try {
      const [parent, thread] = await Promise.all([api.post(id), api.replies(id)]);
      setPost(parent.post); setReplies(thread.posts); setError(null);
    } catch { setError("Could not load this conversation."); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void api.viewPost(id).catch(() => {}); }, [id]);
  const report = async () => {
    if (reporting) return;
    setReporting(true);
    try { await api.report("post", id, "other"); setError("Report sent. Thank you."); }
    catch { setError("Could not send report. Try again."); }
    finally { setReporting(false); }
  };
  const card = (item: PostDTO) => <PostCard post={item} onChanged={() => void load()} onDeleted={item.id === id ? () => nav.goBack() : () => void load()} onOpen={() => nav.navigate("PostDetail", { id: item.id })} onAuthor={(userId) => nav.navigate("PublicProfile", { id: userId })} onQuote={(postId) => nav.navigate("CreatePost", { quotePostId: postId })} />;
  return <FlatList
    style={{ flex: 1, backgroundColor: color.night }}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    data={replies}
    keyExtractor={(item) => item.id}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      {post ? card(post) : <Text style={{ color: color.textSecondary, ...type.body }}>{error ?? "Loading conversation…"}</Text>}
      {post?.streamId ? <Pressable onPress={() => nav.navigate("Live", { id: post.streamId })} style={{ padding: 12, backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border }}><Text style={{ color: color.lime, ...eyebrow(11) }}>Open linked live stream →</Text></Pressable> : null}
      {post?.momentId ? <Pressable onPress={() => nav.navigate("MomentDetail", { id: post.momentId })} style={{ padding: 12, backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border }}><Text style={{ color: color.lime, ...eyebrow(11) }}>Open linked Moment →</Text></Pressable> : null}
      {post ? <View style={{ flexDirection: "row", gap: 10 }}><Pressable onPress={() => nav.navigate("CreatePost", { replyToId: id })} style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: color.brand }}><Text style={{ color: color.text, ...eyebrow(11) }}>Write a reply</Text></Pressable><Pressable disabled={reporting} onPress={() => void report()} style={{ padding: 12, borderWidth: 1, borderColor: color.border }}><Text style={{ color: color.textSecondary, ...eyebrow(11) }}>Report</Text></Pressable></View> : null}
      {error && post ? <Text accessibilityRole="alert" selectable style={{ color: error.startsWith("Report sent") ? color.lime : color.error, ...type.bodysm }}>{error}</Text> : null}
      <Text style={{ color: color.textSecondary, ...eyebrow(11) }}>Replies · {post?.replies ?? replies.length}</Text>
    </View>}
    renderItem={({ item }) => card(item)}
    ListEmptyComponent={post ? <Text style={{ color: color.textMuted, ...type.bodysm }}>No replies yet. Start the conversation.</Text> : null}
  />;
}
