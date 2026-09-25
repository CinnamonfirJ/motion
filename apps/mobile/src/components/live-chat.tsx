import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { api, type ChatMessageDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useSession } from "../session";
import { Avatar } from "./ui";
import { color, eyebrow, type } from "../theme";

/**
 * Mobile live chat. Inverted FlatList (virtualized) keeps newest at the bottom and sticks there
 * unless the reader scrolls up (then a "new messages" pill appears). Host/author can delete.
 * Designed to live in a bottom sheet so the stream stays visible above it.
 */
export function LiveChat({ streamId, isHost, onlineCount, onClose }: { streamId: string; isHost: boolean; onlineCount?: number; onClose?: () => void }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]); // newest-first (inverted list)
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<FlatList<ChatMessageDTO>>(null);

  useEffect(() => {
    let alive = true;
    api.chatHistory(streamId)
      .then((r) => { if (alive) setMessages([...r.messages].reverse()); })
      .catch(() => { if (alive) setError("Couldn't load chat. It'll catch up in a moment."); });
    return () => { alive = false; };
  }, [streamId]);

  useEffect(() => {
    return realtime.on((ev: any) => {
      if (ev.streamId !== streamId) return;
      if (ev.t === "chat") {
        setMessages((prev) => (prev.some((m) => m.id === ev.message.id) ? prev : [{ ...ev.message, streamId }, ...prev].slice(0, 200)));
        setUnread((n) => (atBottom ? 0 : n + 1));
      } else if (ev.t === "chat_deleted") {
        setMessages((prev) => prev.filter((m) => m.id !== ev.messageId));
      }
    });
  }, [streamId, atBottom]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = e.nativeEvent.contentOffset.y <= 24; // inverted: y≈0 is newest
    setAtBottom(bottom);
    if (bottom) setUnread(0);
  }, []);

  const jumpToLatest = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setAtBottom(true);
    setUnread(0);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try { await api.sendChat(streamId, body); setDraft(""); }
    catch (e: any) {
      const code = String(e?.message ?? e);
      setError(code === "rate-limited" ? "Slow down a moment — you're chatting fast." : code === "too-long" ? "That message is a little long." : "Message didn't send. Try again in a moment.");
    }
    finally { setSending(false); }
  };

  const remove = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try { await api.deleteChat(streamId, id); } catch { setError("Couldn't remove that message."); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.surface1, borderTopWidth: 1, borderColor: color.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.border }}>
        <Text style={{ color: color.text, ...eyebrow(11) }}>Live chat</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {typeof onlineCount === "number" ? <Text style={{ color: color.textMuted, ...eyebrow(10) }}>{onlineCount} watching</Text> : null}
          {onClose ? <Pressable accessibilityLabel="Close chat" onPress={onClose}><Text style={{ color: color.textSecondary, fontSize: 18 }}>×</Text></Pressable> : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          onScroll={onScroll}
          scrollEventThrottle={64}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListEmptyComponent={<Text style={{ color: color.textMuted, ...eyebrow(10), textAlign: "center", marginTop: 24, transform: [{ scaleY: -1 }] }}>No messages yet — say hello.</Text>}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Avatar name={item.author.displayName} url={item.author.avatarUrl} size={22} />
              <Text style={{ flex: 1, color: color.text, ...type.bodysm }}>
                <Text style={{ color: color.lime, fontWeight: "600" }}>{item.author.displayName} </Text>
                {item.body}
              </Text>
              {(isHost || item.author.id === user?.id) ? (
                <Pressable accessibilityLabel="Remove message" onPress={() => void remove(item.id)}><Text style={{ color: color.textMuted, fontSize: 16 }}>×</Text></Pressable>
              ) : null}
            </View>
          )}
        />
        {!atBottom && unread > 0 ? (
          <Pressable onPress={jumpToLatest} style={{ position: "absolute", alignSelf: "center", bottom: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: color.lime, ...eyebrow(10) }}>↓ {unread} new</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1, borderColor: color.border, padding: 8 }}>
        {error ? <Text accessibilityRole="alert" style={{ color: color.error, ...type.micro, marginBottom: 4, paddingHorizontal: 4 }}>{error}</Text> : null}
        {user ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={300}
              placeholder="Say something…"
              placeholderTextColor={color.textMuted}
              accessibilityLabel="Write a message"
              style={{ flex: 1, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, paddingHorizontal: 12, paddingVertical: 8, ...type.bodysm }}
              onSubmitEditing={() => void send()}
              returnKeyType="send"
            />
            <Pressable disabled={sending || !draft.trim()} onPress={() => void send()} style={{ backgroundColor: color.brand, paddingHorizontal: 14, paddingVertical: 10, opacity: sending || !draft.trim() ? 0.4 : 1 }}>
              <Text style={{ color: "#FFFFFF", ...eyebrow(10) }}>Send</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: color.textMuted, ...eyebrow(10), padding: 4 }}>Sign in to join the chat.</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
