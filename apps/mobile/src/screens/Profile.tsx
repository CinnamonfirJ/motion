import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, View, Pressable } from "react-native";
import { useSession } from "../session";
import { api } from "../lib/api";
import { Avatar, Button, Card } from "../components/ui";
import { color, type, radius, eyebrow, monoText } from "../theme";

export function Profile() {
  const { user, logout } = useSession();
  const [scout, setScout] = useState<any>(null);
  const [showWallet, setShowWallet] = useState(false);
  useEffect(() => {
    api.scoutEarnings().then(setScout).catch(() => {});
  }, []);
  if (!user) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View style={{ alignItems: "center", gap: 10, paddingTop: 8 }}>
        <Avatar name={user.displayName} url={user.avatarUrl} size={80} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: color.text, ...type.h2 }}>{user.displayName}</Text>
          <Text style={{ color: color.textMuted, ...type.bodysm }}>@{user.handle}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="Found" value={String(scout?.momentsCurated ?? 0)} />
        <Stat label="First finds" value={String(scout?.firstFinds ?? 0)} />
        <Stat label="Earned" value={scout?.totalUsd ?? "$0"} />
      </View>

      <Card>
        <Pressable onPress={() => setShowWallet((v) => !v)} style={{ padding: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: color.text, ...type.body }}>Account</Text>
          <Text style={{ color: color.textMuted, ...type.bodysm }}>{showWallet ? "Hide" : "Onchain account"}</Text>
        </Pressable>
        {showWallet ? (
          <View style={{ backgroundColor: color.surface2, padding: 16, gap: 6 }}>
            <Row k="Network" v="Monad" />
            <Row k="Wallet" v={`${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`} />
            <Text style={{ color: color.textMuted, ...type.micro, marginTop: 4 }}>Created automatically. No seed phrase needed.</Text>
          </View>
        ) : null}
        <Row2 label="Notifications" value="On" />
        <Row2 label="Appearance" value="Dark" />
      </Card>

      <Button title="Sign out" variant="secondary" onPress={logout} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 20 }}>
        <Text onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_URL || "https://ennoia.app"}/privacy`)} style={{ color: color.textMuted, ...type.bodysm }}>Privacy</Text>
        <Text onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_URL || "https://ennoia.app"}/terms`)} style={{ color: color.textMuted, ...type.bodysm }}>Terms</Text>
      </View>
      <Button
        title="Delete account"
        variant="ghost"
        onPress={() => Alert.alert(
          "Delete ENNOIA account?",
          "This permanently deletes your Privy login and anonymizes offchain activity. Public Monad transactions cannot be erased.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => { void api.deleteAccount().then(logout); } },
          ]
        )}
      />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: "center" }}>
      <Text style={{ color: color.text, ...type.h3 }}>{value}</Text>
      <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 2 }}>{label}</Text>
    </View>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: color.textMuted, ...monoText(13) }}>{k}</Text>
      <Text style={{ color: color.textSecondary, ...monoText(13) }}>{v}</Text>
    </View>
  );
}
function Row2({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: color.border, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: color.text, ...type.body }}>{label}</Text>
      <Text style={{ color: color.textMuted, ...type.bodysm }}>{value}</Text>
    </View>
  );
}
