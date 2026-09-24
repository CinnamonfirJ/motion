import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { env, livekitConfigured } from "./env.js";
import type { User } from "@ennoia/core";

/**
 * LiveKit — livestream A/V. The backend is the ONLY place that holds LIVEKIT_API_SECRET;
 * clients receive a short-lived, room-scoped JWT and never see the key/secret.
 *
 * A room is named after its stream id. The creator joins as **host**; approved speakers
 * may publish microphone and camera tracks; everyone else joins as a subscribe-only
 * **viewer**. When LiveKit is not configured the app uses the fake-live looping player.
 */

export type LiveKitRole = "host" | "speaker" | "viewer";

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

/** Mint a room-scoped token; a speaker's publish sources remain host-controlled. */
export async function roomTokenFor(user: User, streamId: string, role: LiveKitRole, canCamera = false, canScreenShare = false): Promise<LiveKitToken> {
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
    canPublish: role !== "viewer",
    canPublishData: true, // reactions/heat can also ride the LiveKit data channel if desired
  };
  if (role === "speaker") {
    grant.canPublishSources = [
      TrackSource.MICROPHONE,
      ...(canCamera ? [TrackSource.CAMERA] : []),
      ...(canScreenShare ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
    ];
  }
  at.addGrant(grant);

  return { url: env.LIVEKIT_URL, token: await at.toJwt(), room, role };
}
