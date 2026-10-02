import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, TextInput, View, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useSession } from "../session";
import { api } from "../lib/api";
import { Avatar, Button, Card } from "../components/ui";
import { color, type, radius, eyebrow, monoText } from "../theme";

export function Profile() {
  const { user, logout } = useSession();
  const [scout, setScout] = useState<any>(null);
  const [showWallet, setShowWallet] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    api.scoutEarnings().then(setScout).catch(() => {});
  }, []);
  if (!user) return null;
  if (editing) return <EditProfile onClose={() => setEditing(false)} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View style={{ alignItems: "center", gap: 10, paddingTop: 8 }}>
        <Avatar name={user.displayName} url={user.avatarUrl} size={80} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: color.text, ...type.h2 }}>{user.displayName}</Text>
          <Text style={{ color: color.textMuted, ...type.bodysm }}>@{user.handle}</Text>
        </View>
        <Button title="Edit profile" variant="secondary" onPress={() => setEditing(true)} />
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

const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useSession();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const message = (code?: string) =>
    ({
      "handle-taken": "That handle is already taken.",
      "invalid-handle": "Handle must be 3–20 chars: letters, numbers or underscore.",
      "invalid-display-name": "Name must be 1–40 characters.",
      "invalid-avatar-url": "That image couldn't be used. Try another.",
    } as Record<string, string>)[code ?? ""] ?? "Couldn't save. Please try again.";

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0]!;
      const mime = asset.mimeType ?? "image/jpeg";
      if (!AVATAR_TYPES.has(mime)) { setError("Use a JPG, PNG or WebP image."); return; }
      setError(null);
      setUploading(true);
      const file = new File(asset.uri);
      const size = asset.fileSize ?? file.size;
      const signed = await api.uploadPostMedia(mime, size);
      const uploaded = await expoFetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: file });
      if (!uploaded.ok) throw new Error("upload-failed");
      setAvatarUrl(signed.publicUrl);
    } catch {
      setError("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ displayName, handle, avatarUrl });
      onClose();
    } catch (e: any) {
      setError(message(e?.message));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, color: color.text, paddingHorizontal: 14, paddingVertical: 12, ...type.body } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: color.text, ...type.h2 }}>Edit profile</Text>
        <Text onPress={onClose} style={{ color: color.textMuted, ...eyebrow(11) }}>Cancel</Text>
      </View>

      <View style={{ alignItems: "center", gap: 10 }}>
        <Avatar name={displayName || user.displayName} url={avatarUrl} size={88} />
        <Button title={uploading ? "Uploading…" : "Change photo"} variant="secondary" onPress={pickAvatar} disabled={uploading} />
        {avatarUrl ? <Text onPress={() => setAvatarUrl(null)} style={{ color: color.textMuted, ...eyebrow(11) }}>Remove photo</Text> : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: color.textMuted, ...eyebrow(11) }}>Display name</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Your name" placeholderTextColor={color.textMuted} style={inputStyle} />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: color.textMuted, ...eyebrow(11) }}>Handle</Text>
        <TextInput
          value={handle}
          onChangeText={(t) => setHandle(t.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="handle"
          placeholderTextColor={color.textMuted}
          style={inputStyle}
        />
        <Text style={{ color: color.textMuted, ...type.micro }}>3–20 characters · letters, numbers, underscore</Text>
      </View>

      {error ? <Text style={{ color: color.error, ...type.bodysm }}>{error}</Text> : null}

      <Button title={saving ? "Saving…" : "Save changes"} onPress={save} disabled={saving || uploading || !displayName.trim() || handle.length < 3} />
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
