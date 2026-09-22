import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useTracks,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { api } from "../lib/api";
import { color, type } from "../theme";

interface Credentials {
  url: string;
  token: string;
  role: "host" | "viewer";
}

function CameraStage() {
  const tracks = useTracks([Track.Source.Camera]);
  const track = tracks.find(isTrackReference);
  if (!track) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color={color.lime} />
        <Text style={{ color: color.textSecondary, ...type.bodysm }}>Waiting for the camera…</Text>
      </View>
    );
  }
  return <VideoTrack trackRef={track} style={{ flex: 1 }} objectFit="cover" />;
}

export function LiveKitStage({ streamId }: { streamId: string }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void AudioSession.startAudioSession();
    void api.livekitToken(streamId)
      .then((result) => { if (active) setCredentials(result); })
      .catch(() => { if (active) setError("Could not join this live room."); });
    return () => {
      active = false;
      void AudioSession.stopAudioSession();
    };
  }, [streamId]);

  if (error) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><Text style={{ color: color.error, ...type.body, textAlign: "center" }}>{error}</Text></View>;
  }
  if (!credentials) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={color.lime} /></View>;
  }

  const isHost = credentials.role === "host";
  return (
    <LiveKitRoom
      serverUrl={credentials.url}
      token={credentials.token}
      connect
      audio={isHost}
      video={isHost}
      options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }}
      onError={(nextError) => setError(nextError.message)}
    >
      <CameraStage />
    </LiveKitRoom>
  );
}
