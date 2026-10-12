import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { Button, Card, EmptyState, PlusMark, StatusRow } from "../components/ui";
import { color, eyebrow, radius, type } from "../theme";

type ScoutEarnings = Awaited<ReturnType<typeof api.scoutEarnings>>;
type CreatorEarnings = Awaited<ReturnType<typeof api.creatorEarnings>>;
type EarningsMode = "scout" | "creator";

export function Earnings() {
  const nav = useNavigation<any>();
  const [mode, setMode] = useState<EarningsMode>("scout");
  const [scout, setScout] = useState<ScoutEarnings | null>(null);
  const [creator, setCreator] = useState<CreatorEarnings | null>(null);
  const [scoutError, setScoutError] = useState(false);
  const [creatorError, setCreatorError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      api.scoutEarnings()
        .then((data) => { if (active) { setScout(data); setScoutError(false); } })
        .catch(() => { if (active) setScoutError(true); });
      api.creatorEarnings()
        .then((data) => { if (active) { setCreator(data); setCreatorError(false); } })
        .catch(() => { if (active) setCreatorError(true); });
    };
    load();
    const id = setInterval(load, 6000);
    return () => { active = false; clearInterval(id); };
  }, [retry]);

  const data = mode === "scout" ? scout : creator;
  const error = mode === "scout" ? scoutError : creatorError;
  const rewards = mode === "scout" ? scout?.rewards : creator?.payouts;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <Text style={{ color: color.text, ...type.h1 }}>Earnings</Text>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderWidth: 1, borderColor: color.border }}>
        {(["scout", "creator"] as const).map((tab) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={`${tab === "scout" ? "Scout" : "Creator"} earnings`}
            accessibilityState={{ selected: mode === tab }}
            onPress={() => setMode(tab)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: mode === tab ? color.brand : color.surface1,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: mode === tab ? color.text : color.textSecondary, ...eyebrow(11) }}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: color.error, ...type.bodysm }}>Could not load {mode} earnings{data ? "; showing the last update." : "."}</Text>
          <Button title="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} />
        </View>
      )}
      {!data ? (
        !error && <ActivityIndicator color={color.lime} accessibilityLabel={`Loading ${mode} earnings`} />
      ) : (
        <>
          <Card style={{ padding: 24 }}>
            <PlusMark style={{ left: -6, top: -6 }} />
            <PlusMark style={{ right: -6, top: -6 }} />
            <Text selectable style={{ color: color.text, ...type.display }}>{data.totalUsd}</Text>
            <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 6 }}>{mode === "scout" ? "Total earned" : "Creator earnings"}</Text>
            {data.totalMon && <Text selectable style={{ color: color.textSecondary, ...type.bodysm, marginTop: 6 }}>{data.totalMon} paid onchain{data.pendingUsd && data.pendingUsd !== "$0.00" ? ` · ${data.pendingUsd} settling` : ""}</Text>}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              {mode === "scout" && scout ? (
                <>
                  <Stat label="Moments" value={scout.momentsCurated} />
                  <Stat label="First finds" value={scout.firstFinds} />
                </>
              ) : creator ? (
                <>
                  <Stat label="Moments generated" value={creator.momentsGenerated} />
                  <Stat label="Founding curators" value={creator.payouts.reduce((sum, payout) => sum + payout.foundingCuratorCount, 0)} />
                </>
              ) : null}
            </View>
          </Card>

          <Text style={{ color: color.text, ...type.h3 }}>Recent rewards</Text>
          {rewards?.length === 0 ? (
            mode === "scout" ? (
              <EmptyState title="Your first find is still out there." body="React when something feels worth catching." />
            ) : (
              <EmptyState title="Your next stream could change that." body="When your audience reacts together, ENNOIA starts watching too." />
            )
          ) : (
            <View style={{ gap: 8 }}>
              {mode === "scout" ? scout?.rewards.map((reward) => (
                <RewardRow key={reward.momentId} onPress={() => nav.navigate("MomentDetail", { id: reward.momentId })} title={reward.streamTitle} subtitle={`Founding Curator #${reward.rank}`} amount={reward.rewardUsd} status={reward.status} />
              )) : creator?.payouts.map((payout) => (
                <RewardRow key={payout.momentId} onPress={() => nav.navigate("MomentDetail", { id: payout.momentId })} title={payout.streamTitle} subtitle={`${payout.foundingCuratorCount} founding curators`} amount={payout.rewardUsd} status={payout.status} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.surface2, borderRadius: radius.sm, padding: 12 }}>
      <Text selectable style={{ color: color.text, ...type.h3 }}>{value}</Text>
      <Text style={{ color: color.textMuted, ...eyebrow(11), marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function RewardRow({ onPress, title, subtitle, amount, status }: { onPress: () => void; title: string; subtitle: string; amount: string; status: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.surface1, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, padding: 12 }}>
      <View style={{ width: 44, height: 44, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 8, height: 8, backgroundColor: color.lime }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: color.text, ...type.body, fontWeight: "500" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: color.textMuted, ...eyebrow(11), marginTop: 2 }}>{subtitle}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text selectable style={{ color: color.lime, ...type.body, fontWeight: "600" }}>{amount}</Text>
        <StatusRow status={status} />
      </View>
    </Pressable>
  );
}
