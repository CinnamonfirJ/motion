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
      setError("ENNOIA could not start the room or its permanent recording. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: color.night }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: color.text, ...type.h2 }}>Set the scene</Text>
          <Text style={{ color: color.textSecondary, ...type.body }}>Your camera and microphone start only after the secure LiveKit room and R2 recording are ready.</Text>
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
