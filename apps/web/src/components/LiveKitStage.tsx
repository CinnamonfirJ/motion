import { useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { api } from "../lib/api";

interface Credentials {
  url: string;
  token: string;
  role: "host" | "viewer";
}

/** Real LiveKit A/V stage. Tokens are short-lived and always minted by the backend. */
export function LiveKitStage({ streamId }: { streamId: string }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.livekitToken(streamId)
      .then((value) => { if (active) setCredentials(value); })
      .catch(() => { if (active) setError("Could not join this live room."); });
    return () => { active = false; };
  }, [streamId]);

  if (error) return <div className="grid h-full place-items-center bg-black text-text-secondary">{error}</div>;
  if (!credentials) {
    return (
      <div className="grid h-full place-items-center bg-black text-text-secondary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-lime border-t-transparent" />
      </div>
    );
  }

  const isHost = credentials.role === "host";
  return (
    <LiveKitRoom
      token={credentials.token}
      serverUrl={credentials.url}
      connect
      audio={isHost}
      video={isHost}
      data-lk-theme="default"
      className="h-full"
    >
      <VideoConference />
      <RoomAudioRenderer />
      <StartAudio label="Enable stream audio" />
    </LiveKitRoom>
  );
}
