import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { Button } from "../components/ui";
import { color, MONO, type } from "../theme";

export function GoLive() {
  const navigation = useNavigation<any>();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createStream(title.trim());
      navigation.replace("Live", { id: result.stream.id });
    } catch {
      setError("ENNOIA couldn't start your live room. Check your connection and try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.night }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: color.text, ...type.h2 }}>Set the scene</Text>
          <Text style={{ color: color.textSecondary, ...type.body }}>Give your stream a title, then go live. You control your camera and mic from the studio once you're on.</Text>
        </View>
        {/* Permission priming (design brief §14): explain before the OS prompts appear. */}
        <View style={{ borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, padding: 12, gap: 6 }}>
          <Text style={{ color: color.lime, ...type.label }}>What happens next</Text>
          <Text style={{ color: color.textSecondary, ...type.bodysm }}>• A secure LiveKit room + recording start first.</Text>
          <Text style={{ color: color.textSecondary, ...type.bodysm }}>• ENNOIA asks for camera + microphone access — allow it to appear on stream.</Text>
          <Text style={{ color: color.textSecondary, ...type.bodysm }}>• Denied by mistake? Enable Camera/Microphone for ENNOIA in device Settings, then reopen the studio.</Text>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What are you streaming?"
          placeholderTextColor={color.textMuted}
          maxLength={120}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => { if (title.trim() && !busy) void start(); }}
          style={{ minHeight: 52, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, color: color.text, paddingHorizontal: 16, fontFamily: MONO, fontSize: 15 }}
        />
        {error ? <Text selectable style={{ color: color.error, ...type.bodysm }}>{error}</Text> : null}
        <Button title={busy ? "Starting secure room…" : "Go live"} onPress={() => void start()} disabled={busy || !title.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
