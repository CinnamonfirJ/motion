import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useEffect, useState, type ReactNode } from "react";
import { color, radius, MONO, eyebrow, monoText, REACTION_ICON } from "../theme";

/** Four corner brackets drawn just inside a box (matches the reference's secondary buttons). */
export function Brackets({ c = color.text, size = 9 }: { c?: string; size?: number }) {
  const base = { position: "absolute" as const, width: size, height: size, borderColor: c };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[base, { left: 0, top: 0, borderLeftWidth: 1, borderTopWidth: 1 }]} />
      <View style={[base, { right: 0, top: 0, borderRightWidth: 1, borderTopWidth: 1 }]} />
      <View style={[base, { left: 0, bottom: 0, borderLeftWidth: 1, borderBottomWidth: 1 }]} />
      <View style={[base, { right: 0, bottom: 0, borderRightWidth: 1, borderBottomWidth: 1 }]} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  right,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  right?: ReactNode;
}) {
  // ENNOIA primary: brand purple with white text (accessible on the bright brand).
  const bg = variant === "primary" ? color.brand : "transparent";
  const fg = variant === "primary" ? "#FFFFFF" : color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, flexDirection: "row", gap: 8 },
      ]}
    >
      {variant !== "primary" && <Brackets c={color.text} />}
      <Text style={{ color: fg, fontFamily: MONO, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" }}>{title}</Text>
      {right}
    </Pressable>
  );
}

export function TagChip({ children }: { children: ReactNode }) {
  return (
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, paddingHorizontal: 10, paddingVertical: 6 }}>
      <View style={{ width: 8, height: 8, backgroundColor: color.lime }} />
      <Text style={{ ...eyebrow(11), color: color.textSecondary }}>{children}</Text>
    </View>
  );
}

export function SectionIndex({ index, total = 6, label }: { index: number; total?: number; label: string }) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <Text style={{ ...eyebrow(11), color: color.textMuted }}>
      [ {p(index)} OF {p(total)} ] · {label}
    </Text>
  );
}

/** A small `+` plus-mark for frame corners. */
export function PlusMark({ style }: { style?: any }) {
  return (
    <View pointerEvents="none" style={[{ position: "absolute", width: 11, height: 11, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", width: 1, height: 11, backgroundColor: color.lime, opacity: 0.7 }} />
      <View style={{ position: "absolute", height: 1, width: 11, backgroundColor: color.lime, opacity: 0.7 }} />
    </View>
  );
}

export function Avatar({ name, size = 40, url }: { name: string; size?: number; url?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const h = hue(name);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: `hsl(${h}, 60%, 62%)`, alignItems: "center", justifyContent: "center" }}>
      {url && !failed ? <Image source={{ uri: url }} contentFit="cover" accessibilityLabel={`${name}'s profile picture`} onError={() => setFailed(true)} style={{ width: size, height: size }} /> : <Text style={{ color: color.night, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>}
    </View>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "live" | "lime" }) {
  const map = {
    neutral: { bg: color.surface1, fg: color.textSecondary, bd: color.border },
    live: { bg: "rgba(255,98,107,0.10)", fg: color.error, bd: "rgba(255,98,107,0.4)" },
    lime: { bg: "rgba(140,100,255,0.10)", fg: color.lime, bd: "rgba(140,100,255,0.4)" },
  }[tone];
  return (
    <View style={{ borderWidth: 1, borderColor: map.bd, backgroundColor: map.bg, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
      {tone === "live" && <View style={{ width: 6, height: 6, backgroundColor: color.error }} />}
      <Text style={{ ...eyebrow(11), color: map.fg }}>{children}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[{ backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border }, style]}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: color.night }}>
      <ActivityIndicator color={color.lime} />
      {label ? <Text style={{ color: color.textSecondary, ...monoText(15) }}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 48, borderWidth: 1, borderColor: color.border, borderStyle: "dashed" }}>
      <View style={{ width: 44, height: 44, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 8, height: 8, backgroundColor: color.lime }} />
      </View>
      <Text style={{ color: color.text, fontSize: 20, fontWeight: "600" }}>{title}</Text>
      <Text style={{ color: color.textSecondary, ...monoText(13), textAlign: "center", paddingHorizontal: 24 }}>{body}</Text>
    </View>
  );
}

/** Reaction spike graph as a bar sparkline (no SVG dep). */
export function ReactionGraph({ durationSec, peakOffsetSec, total, live }: { durationSec: number; peakOffsetSec: number; total: number; live?: boolean }) {
  const N = 28;
  const dur = Math.max(1, durationSec);
  const sigma = dur / 7;
  const bars = Array.from({ length: N }, (_, i) => {
    const t = (i / (N - 1)) * dur;
    return 0.15 + Math.exp(-((t - peakOffsetSec) ** 2) / (2 * sigma * sigma));
  });
  const max = Math.max(...bars);
  const peakIdx = Math.round((Math.min(dur, peakOffsetSec) / dur) * (N - 1));
  const accent = color.electric; // ENNOIA: graphs / spike line use --color-4
  return (
    <View accessible accessibilityLabel={`Reaction activity peaked ${Math.round(peakOffsetSec)} seconds in, from ${total} reactions.`}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap: 3 }}>
        {bars.map((b, i) => (
          <View key={i} style={{ flex: 1, height: `${(b / max) * 100}%`, backgroundColor: i === peakIdx ? accent : i > N * 0.5 ? "rgba(80,200,255,0.45)" : color.surface3 }} />
        ))}
      </View>
    </View>
  );
}

export function ReactionMix({ mix }: { mix: { fire: number; laugh: number; wow: number } }) {
  const total = mix.fire + mix.laugh + mix.wow || 1;
  const items: [keyof typeof REACTION_ICON, number, string][] = [
    ["fire", mix.fire, color.fire],
    ["laugh", mix.laugh, color.laugh],
    ["wow", mix.wow, color.wow],
  ];
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {items.map(([k, v, c]) => (
        <Text key={k} style={{ ...monoText(12), color: color.textSecondary }}>
          {REACTION_ICON[k]} <Text style={{ color: c }}>{Math.round((v / total) * 100)}%</Text>
        </Text>
      ))}
    </View>
  );
}

export function StatusRow({ status }: { status: string }) {
  const map: Record<string, { icon: string; label: string; c: string }> = {
    confirmed: { icon: "✓", label: "Settled", c: color.success },
    pending: { icon: "○", label: "Reward settling", c: color.warning },
    submitted: { icon: "○", label: "Reward settling", c: color.warning },
    failed: { icon: "!", label: "Reward delayed", c: color.error },
  };
  const s = map[status] ?? map.pending!;
  return <Text style={{ ...eyebrow(11), color: s.c }}>{s.icon} {s.label}</Text>;
}

export function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.night },
  pad: { padding: 16 },
});
