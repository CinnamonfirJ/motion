import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, type MomentDTO } from "../lib/api";
import { EmptyState } from "../components/ui";
import { MomentCard } from "./Home";
import { color, type } from "../theme";

export function Moments() {
  const nav = useNavigation<any>();
  const [moments, setMoments] = useState<MomentDTO[]>([]);
  useEffect(() => {
    const load = () => api.moments().then((r) => setMoments(r.moments)).catch(() => {});
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.night }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ color: color.text, ...type.h1 }}>Moments</Text>
      {moments.length === 0 ? (
        <EmptyState title="Nothing has spiked yet." body="When the crowd catches something, it'll appear here." />
      ) : (
        <View style={{ gap: 16 }}>
          {moments.map((m) => (
            <MomentCard key={m.id} moment={m} onPress={() => nav.navigate("MomentDetail", { id: m.id })} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
