import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { api, type MomentDTO, type StreamDTO } from "../lib/api";
import { color, eyebrow, type } from "../theme";

const supported = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);

export function CreatePost() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as { communityId?: string; quotePostId?: string; replyToId?: string };
  const [draft, setDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [embed, setEmbed] = useState("");
  const [streams, setStreams] = useState<StreamDTO[]>([]);
  const [moments, setMoments] = useState<MomentDTO[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.quotePostId || params.replyToId) return;
    void Promise.all([api.streams(), api.moments()]).then(([live, recent]) => { setStreams(live.streams); setMoments(recent.moments.slice(0, 15)); }).catch(() => {});
  }, [params.quotePostId, params.replyToId]);

  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.85 });
      if (result.canceled) return;
      if (result.assets.some((asset) => asset.type === "video") && result.assets.length > 1) { setError("Choose one video or up to four images."); return; }
      if (result.assets.length > 4) { setError("Choose up to four images."); return; }
      setAssets(result.assets); setUploadedIds([]); setError(null);
    } catch { setError("Could not open your media library. Try again."); }
  };
  const publish = async () => {
    if (pending || (!draft.trim() && !assets.length && !linkUrl.trim() && !embed && !params.quotePostId && !params.replyToId)) return;
    setPending(true); setError(null);
    const ids = [...uploadedIds];
    try {
      for (let index = ids.length; index < assets.length; index++) {
        const asset = assets[index]!;
        const mime = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
        if (!supported.has(mime)) throw new Error(`Unsupported media type: ${mime}. Choose JPEG, PNG, WebP, MP4, or WebM.`);
        const file = new File(asset.uri);
        const size = asset.fileSize ?? file.size;
        const signed = await api.uploadPostMedia(mime, size);
        const uploaded = await expoFetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: file });
        if (!uploaded.ok) throw new Error(`Upload failed (${uploaded.status}). Please retry.`);
        ids.push(signed.uploadId); setUploadedIds([...ids]);
      }
      await api.createPost({
        text: draft.trim(), uploadIds: ids, linkUrl: linkUrl.trim() || undefined,
        communityId: params.communityId, quotePostId: params.quotePostId, replyToId: params.replyToId,
        ...(embed.startsWith("stream:") ? { streamId: embed.slice(7) } : embed.startsWith("moment:") ? { momentId: embed.slice(7) } : {}),
      });
      nav.goBack();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish. Your draft is still here."); }
    finally { setPending(false); }
  };

  return <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.night }}><ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
    <Text style={{ color: color.lime, ...eyebrow(11) }}>{params.replyToId ? "Reply" : params.quotePostId ? "Quote post" : params.communityId ? "Community post" : "New post"}</Text>
    <TextInput multiline maxLength={2800} autoFocus placeholder="What's happening?" placeholderTextColor={color.textMuted} value={draft} onChangeText={setDraft} style={{ minHeight: 140, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, color: color.text, padding: 14, textAlignVertical: "top", ...type.body }} />
    {!params.replyToId && !params.quotePostId ? <>
      <TextInput autoCapitalize="none" keyboardType="url" placeholder="HTTPS link (optional)" placeholderTextColor={color.textMuted} value={linkUrl} onChangeText={setLinkUrl} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, padding: 12, ...type.bodysm }} />
      <Pressable accessibilityRole="button" onPress={() => void pick()} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, padding: 12 }}><Text style={{ color: color.text, ...eyebrow(11) }}>Choose images or video</Text></Pressable>
      {assets.map((asset) => <View key={asset.assetId ?? asset.uri} style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 8, gap: 6 }}><Text numberOfLines={1} style={{ color: color.textSecondary, ...type.bodysm }}>{asset.fileName ?? "Selected media"}</Text>{asset.type === "image" ? <Image source={{ uri: asset.uri }} contentFit="cover" style={{ width: "100%", aspectRatio: 4 / 3 }} /> : null}</View>)}
      <Text style={{ color: color.textSecondary, ...eyebrow(11) }}>Embed live stream or Moment</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Pressable onPress={() => setEmbed("")} style={{ borderWidth: 1, borderColor: !embed ? color.lime : color.border, padding: 9 }}><Text style={{ color: !embed ? color.lime : color.textSecondary, ...eyebrow(10) }}>None</Text></Pressable>{streams.map((stream) => <Pressable key={stream.id} onPress={() => setEmbed(`stream:${stream.id}`)} style={{ borderWidth: 1, borderColor: embed === `stream:${stream.id}` ? color.lime : color.border, padding: 9 }}><Text numberOfLines={1} style={{ color: color.text, ...eyebrow(10) }}>Live · {stream.title}</Text></Pressable>)}{moments.map((moment) => <Pressable key={moment.id} onPress={() => setEmbed(`moment:${moment.id}`)} style={{ borderWidth: 1, borderColor: embed === `moment:${moment.id}` ? color.lime : color.border, padding: 9 }}><Text numberOfLines={1} style={{ color: color.text, ...eyebrow(10) }}>Moment · {moment.streamTitle}</Text></Pressable>)}</ScrollView>
    </> : null}
    {error ? <Text selectable accessibilityRole="alert" style={{ color: color.error, ...type.bodysm }}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={pending || (!draft.trim() && !assets.length && !linkUrl.trim() && !embed && !params.quotePostId)} onPress={() => void publish()} style={{ backgroundColor: color.brand, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pending ? 0.5 : 1 }}><Text style={{ color: color.text, ...eyebrow(12) }}>{pending ? "Publishing…" : "Publish"}</Text></Pressable>
  </ScrollView></KeyboardAvoidingView>;
}
