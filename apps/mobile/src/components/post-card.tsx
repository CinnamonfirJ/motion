import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, type PostDTO } from "../lib/api";
import { color, eyebrow, type } from "../theme";
import { Avatar } from "./ui";

function PostVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: color.night }} contentFit="contain" nativeControls />;
}

export function PostCard({ post, onChanged, onOpen, onAuthor, onQuote }: {
  post: PostDTO;
  onChanged: () => void;
  onOpen: () => void;
  onAuthor: (id: string) => void;
  onQuote: (id: string) => void;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<PostDTO | null>(null);
  useEffect(() => { setLiked(post.liked); setLikes(post.likes); }, [post.id, post.liked, post.likes]);
  useEffect(() => {
    const id = post.quotePostId ?? post.repostOfId;
    if (!id) return;
    let active = true;
    void api.post(id).then((result) => { if (active) setReference(result.post); }).catch(() => {});
    return () => { active = false; };
  }, [post.quotePostId, post.repostOfId]);

  const toggleLike = async () => {
    if (pending) return;
    setPending(true); setError(null);
    try { if (liked) await api.unlikePost(post.id); else await api.likePost(post.id); setLiked(!liked); setLikes((count) => count + (liked ? -1 : 1)); }
    catch { setError("Could not update your like."); }
    finally { setPending(false); }
  };
  const reshare = async () => {
    if (pending) return;
    setPending(true); setError(null);
    try { await api.createPost({ repostOfId: post.id }); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reshare."); }
    finally { setPending(false); }
  };
  const openLink = async () => {
    if (!post.linkUrl) return;
    try { await Linking.openURL(post.linkUrl); } catch { setError("Could not open link."); }
  };
  const meta = { color: color.textSecondary, ...eyebrow(10) };

  return <View style={{ backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, padding: 14, gap: 10 }}>
    {post.repostOfId ? <Text style={{ color: color.textMuted, ...eyebrow(10) }}>↻ {post.author.displayName} reshared</Text> : null}
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Pressable accessibilityRole="button" accessibilityLabel={`${post.author.displayName}'s profile`} onPress={() => onAuthor(post.author.id)}><Avatar name={post.author.displayName} url={post.author.avatarUrl} size={38} /></Pressable><Pressable style={{ flex: 1 }} onPress={() => onAuthor(post.author.id)}><Text style={{ color: color.text, ...type.bodysm, fontWeight: "700" }}>{post.author.displayName}</Text><Text style={{ color: color.textMuted, ...type.micro }}>@{post.author.handle} · {new Date(post.createdAt).toLocaleString()}</Text></Pressable></View>
    {post.body ? <Pressable onPress={onOpen}><Text selectable style={{ color: color.text, ...type.body }}>{post.body}</Text></Pressable> : null}
    {post.linkUrl ? <Pressable accessibilityRole="link" onPress={() => void openLink()}><Text selectable style={{ color: color.lime, ...type.bodysm }}>{post.linkUrl}</Text></Pressable> : null}
    {post.media.map((url) => /\.(mp4|webm)(\?|$)/i.test(url) ? <PostVideo key={url} url={url} /> : <Image key={url} source={{ uri: url }} contentFit="cover" style={{ width: "100%", aspectRatio: 4 / 3, backgroundColor: color.surface2 }} />)}
    {post.streamId ? <Pressable onPress={onOpen} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 12 }}><Text style={{ color: color.lime, ...eyebrow(11) }}>● Linked live stream →</Text></Pressable> : null}
    {post.momentId ? <Pressable onPress={onOpen} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 12 }}><Text style={{ color: color.lime, ...eyebrow(11) }}>✦ Linked Moment →</Text></Pressable> : null}
    {reference ? <View style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 12, gap: 4 }}><Text style={{ color: color.text, ...type.bodysm, fontWeight: "700" }}>{reference.author.displayName}</Text><Text numberOfLines={3} style={{ color: color.textSecondary, ...type.bodysm }}>{reference.body || "Reshared post"}</Text></View> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderColor: color.border, paddingTop: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Replies ${post.replies}`} onPress={onOpen}><Text style={meta}>Reply · {post.replies}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Reshare ${post.reposts}`} disabled={pending} onPress={() => void reshare()}><Text style={meta}>↻ {post.reposts}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Quote post" onPress={() => onQuote(post.id)}><Text style={meta}>Quote</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Likes ${likes}`} accessibilityState={{ selected: liked }} disabled={pending} onPress={() => void toggleLike()}><Text style={{ ...meta, color: liked ? color.lime : color.textSecondary }}>♥ {likes}</Text></Pressable>
      <Text style={meta}>Views · {post.views}</Text>
    </View>
    {error ? <Text selectable accessibilityRole="alert" style={{ color: color.error, ...type.bodysm }}>{error}</Text> : null}
  </View>;
}
