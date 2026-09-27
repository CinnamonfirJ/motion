import { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../session";
import { Button, TagChip } from "../components/ui";
import { color, type, monoText, MONO } from "../theme";

export function SignIn() {
  const { login, signInPasskey, createPasskey, authMode } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [busy, setBusy] = useState<null | "signin" | "create" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  // Privy is the auth source of truth when configured (EXPO_PUBLIC_PRIVY_APP_ID set): the app
  // is a real dev/release build here, so native passkeys work. Only when Privy is NOT configured
  // do we fall back to the demo (guest / email) path — never gate on a client passkey stub.
  const privy = authMode === "privy";

  const run = async (kind: "signin" | "create" | "email", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/no-passkey-account|no.?account/i.test(msg)) setError("No passkey on this device yet — create one below.");
      else if (/cancel|dismiss|abort/i.test(msg)) setError(null);
      else if (/network|fetch|failed|timeout/i.test(msg)) setError("ENNOIA isn't answering. Check your connection and try again in a moment.");
      else setError("That didn't land — give it a moment and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.night }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
            <View style={{ width: 36, height: 36, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              <Image source={require("../../assets/ennoia-mark.png")} style={{ width: 90, height: 90 }} resizeMode="contain" />
            </View>
            <Text style={{ color: color.text, ...type.h2, letterSpacing: 1.8 }}>ENNOIA</Text>
          </View>

          <View style={{ marginVertical: 28 }}>
            <TagChip>Live curation on Monad</TagChip>
            <Text style={{ color: color.text, ...type.h1, marginTop: 16 }}>Spot the moment first.</Text>
            <Text style={{ color: color.textSecondary, ...monoText(15), lineHeight: 22, marginTop: 12 }}>
              Your passkey creates an account on Monad. Unlock with Face ID or your fingerprint — no seed phrase.
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {privy ? (
              <>
                <Button title={busy === "signin" ? "Waiting for passkey…" : "Sign in with passkey"} onPress={() => run("signin", signInPasskey)} disabled={busy !== null} />
                <Text style={{ color: color.textMuted, ...monoText(11), textTransform: "uppercase", letterSpacing: 1.2, textAlign: "center" }}>New here? Create one</Text>
                <TextInput
                  placeholder="Display name (for a new account)"
                  placeholderTextColor={color.textMuted}
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel="Display name"
                  style={{ backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1, color: color.text, padding: 14, fontSize: 15, fontFamily: MONO }}
                />
                <Button title={busy === "create" ? "Creating passkey…" : "Create a passkey"} variant="secondary" onPress={() => run("create", () => createPasskey(name.trim() || "Scout"))} disabled={busy !== null} />
              </>
            ) : (
              <>
                <Button title={busy === "email" ? "One moment…" : "Continue as guest"} onPress={() => run("email", () => login(`demo${Math.floor(Math.random() * 100000)}@ennoia.app`))} disabled={busy !== null} />
                <Text style={{ color: color.textMuted, ...type.micro, textAlign: "center" }}>Demo account · passkey sign-in needs a Privy-configured build</Text>
                <Text onPress={() => setShowEmail((v) => !v)} style={{ ...monoText(11), color: color.textMuted, textTransform: "uppercase", letterSpacing: 1.2 }}>
                  {showEmail ? "Hide email" : "Use email instead"}
                </Text>
                {showEmail ? (
                  <View style={{ gap: 10 }}>
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
                    <Button title={busy === "email" ? "Signing in…" : "Continue with email"} variant="secondary" onPress={() => run("email", () => login(email.trim()))} disabled={busy !== null || !email.trim()} />
                  </View>
                ) : null}
              </>
            )}

            {error ? <Text style={{ color: color.error, ...type.bodysm, textAlign: "center" }}>{error}</Text> : null}
            <Text style={{ color: color.textMuted, ...type.micro, textAlign: "center" }}>Your passkey creates an account on Monad (Privy). No seed phrase.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
