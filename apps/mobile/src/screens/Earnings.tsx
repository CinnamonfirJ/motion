import { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { EmptyState, StatusRow, Card, PlusMark } from "../components/ui";
import { color, type, radius, eyebrow } from "../theme";

export function Earnings() {
  const nav = useNavigation<any>();
  const [scout, setScout] = useState<any>(null);
  useEffect(() => {
    const load = () => api.scoutEarnings().then(setScout).catch(() => setScout({ totalUsd: "$0.00", momentsCurated: 0, firstFinds: 0, rewards: [] }));
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);
  if (!scout) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <Text style={{ color: color.text, ...type.h1 }}>Earnings</Text>
      <Card style={{ padding: 24 }}>
        <PlusMark style={{ left: -6, top: -6 }} />
        <PlusMark style={{ right: -6, top: -6 }} />
        <Text style={{ color: color.text, ...type.display }}>{scout.totalUsd}</Text>
        <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 6 }}>Total earned</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
          <Stat label="Moments" value={scout.momentsCurated} />
          <Stat label="First finds" value={scout.firstFinds} />
        </View>
      </Card>

      <Text style={{ color: color.text, ...type.h3 }}>Recent rewards</Text>
      {scout.rewards.length === 0 ? (
        <EmptyState title="Your first find is still out there." body="React when something feels worth catching." />
      ) : (
        <View style={{ gap: 8 }}>
          {scout.rewards.map((r: any) => (
            <Pressable key={r.momentId} onPress={() => nav.navigate("MomentDetail", { id: r.momentId })} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, padding: 12 }}>
              <View style={{ width: 44, height: 44, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 8, height: 8, backgroundColor: color.lime }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: color.text, ...type.body, fontWeight: "500" }}>{r.streamTitle}</Text>
                <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 2 }}>Founding Curator #{r.rank}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: color.lime, ...type.body, fontWeight: "600" }}>{r.rewardUsd}</Text>
                <StatusRow status={r.status} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.surface2, borderRadius: radius.sm, padding: 12 }}>
      <Text style={{ color: color.text, ...type.h3 }}>{value}</Text>
      <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 2 }}>{label}</Text>
    </View>
  );
}
