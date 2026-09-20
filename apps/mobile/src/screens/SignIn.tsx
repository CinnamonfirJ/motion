import { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../session";
import { Button, TagChip } from "../components/ui";
import { color, type, monoText, MONO } from "../theme";

export function SignIn() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doLogin = async (seed?: string) => {
    const addr = seed ?? email;
    if (!addr.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await login(addr.trim());
    } catch {
      setError("Couldn't sign you in. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.night }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "space-between", padding: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: color.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: color.night, fontWeight: "700", fontSize: 18 }}>M</Text>
          </View>
          <Text style={{ color: color.text, ...type.h2 }}>Moment</Text>
        </View>

        <View>
          <TagChip>Live curation on Monad</TagChip>
          <Text style={{ color: color.text, ...type.h1, marginTop: 16 }}>Spot the moment first.</Text>
          <Text style={{ color: color.textSecondary, ...monoText(15), lineHeight: 22, marginTop: 12 }}>
            Watch live. Catch what matters. Earn when you're early.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Button title="Continue with Google" onPress={() => doLogin(`demo${Math.floor(Math.random() * 100000)}@moment.app`)} disabled={busy} />
          <TextInput
            placeholder="you@email.com"
            placeholderTextColor={color.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel="Email address"
            style={{ backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1, color: color.text, padding: 14, fontSize: 15, fontFamily: MONO }}
          />
          <Button title={busy ? "Signing in…" : "Continue with email"} variant="secondary" onPress={() => doLogin()} disabled={busy || !email.trim()} />
          {error ? <Text style={{ color: color.error, ...type.bodysm, textAlign: "center" }}>{error}</Text> : null}
          <Text style={{ color: color.textMuted, ...type.micro, textAlign: "center" }}>Your wallet is created automatically. No seed phrase.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
