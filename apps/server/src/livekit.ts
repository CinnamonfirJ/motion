import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import { env, livekitConfigured } from "./env.js";
import type { User } from "@ennoia/core";

/**
 * LiveKit — livestream A/V. The backend is the ONLY place that holds LIVEKIT_API_SECRET;
 * clients receive a short-lived, room-scoped JWT and never see the key/secret.
 *
 * A room is named after its stream id. The stream's creator joins as **host** (can publish
 * audio/video); everyone else joins as **viewer** (subscribe-only). When LiveKit is not
 * configured the app uses the fake-live looping player instead (see streamView `mode`).
 */

export type LiveKitRole = "host" | "viewer";

export interface LiveKitToken {
  url: string;
  token: string;
  room: string;
  role: LiveKitRole;
}

export function livekitEnabled(): boolean {
  return livekitConfigured();
}

export function roomNameForStream(streamId: string): string {
  return `stream_${streamId}`;
}

/** Mint a room-scoped access token for a user. Host => publish; viewer => subscribe-only. */
export async function roomTokenFor(user: User, streamId: string, role: LiveKitRole): Promise<LiveKitToken> {
  if (!livekitConfigured()) throw new Error("livekit-not-configured");
  const room = roomNameForStream(streamId);

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: user.id,
    name: user.displayName,
    ttl: "1h",
  });

  const grant: VideoGrant = {
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "host",
    canPublishData: true, // reactions/heat can also ride the LiveKit data channel if desired
  };
  at.addGrant(grant);

  return { url: env.LIVEKIT_URL, token: await at.toJwt(), room, role };
}
