import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { db } from "./db.js";
import { env, livekitConfigured } from "./env.js";
import { roomNameForStream } from "./livekit.js";
import { Streams } from "./store.js";
import { stopStreamRecording } from "./media.js";
import { hub } from "./realtime.js";

export type SpeakerStatus = "requested" | "invited" | "approved";
export interface SpeakerState {
  userId: string;
  status: SpeakerStatus;
  canCamera: boolean;
  canScreenShare: boolean;
}

const graceMs = 5 * 60_000;
const roomService = livekitConfigured()
  ? new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, "http"), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET)
  : null;

export const LiveRooms = {
  async state(streamId: string) {
    const [presence] = await db.query<{ hostConnected: boolean | number; hostDisconnectedAt: number | null }>(
      'SELECT hostConnected AS "hostConnected", hostDisconnectedAt AS "hostDisconnectedAt" FROM stream_presence WHERE streamId = $1', [streamId]
    );
    const speakers = await db.query<{ userId: string; status: SpeakerStatus; canCamera: boolean | number; canScreenShare: boolean | number }>(
      'SELECT userId AS "userId", status, canCamera AS "canCamera", canScreenShare AS "canScreenShare" FROM stream_speakers WHERE streamId = $1 ORDER BY updatedAt DESC', [streamId]
    );
    return {
      hostConnected: presence?.hostConnected === true || presence?.hostConnected === 1,
      hostDisconnectedAt: presence?.hostDisconnectedAt == null ? null : Number(presence.hostDisconnectedAt),
      graceEndsAt: presence?.hostDisconnectedAt == null ? null : Number(presence.hostDisconnectedAt) + graceMs,
      speakers: speakers.map((row) => ({
        userId: row.userId,
        status: row.status,
        canCamera: row.canCamera === true || row.canCamera === 1,
        canScreenShare: row.canScreenShare === true || row.canScreenShare === 1,
      })),
    };
  },

  async speaker(streamId: string, userId: string): Promise<SpeakerState | null> {
    const [row] = await db.query<{ userId: string; status: SpeakerStatus; canCamera: boolean | number; canScreenShare: boolean | number }>(
      'SELECT userId AS "userId", status, canCamera AS "canCamera", canScreenShare AS "canScreenShare" FROM stream_speakers WHERE streamId = $1 AND userId = $2', [streamId, userId]
    );
    return row ? { userId, status: row.status, canCamera: row.canCamera === true || row.canCamera === 1, canScreenShare: row.canScreenShare === true || row.canScreenShare === 1 } : null;
  },

  async setSpeaker(streamId: string, userId: string, status: SpeakerStatus | null, canCamera = false, canScreenShare = false) {
    if (roomService) {
      // A disconnected invitee receives the same permissions in their next freshly minted token.
      const roomName = roomNameForStream(streamId);
      const exists = (await roomService.listRooms([roomName])).length > 0;
      const participants = exists ? await roomService.listParticipants(roomName) : [];
      if (participants.some((participant) => participant.identity === userId)) {
        const sources = status === "approved"
          ? [TrackSource.MICROPHONE, ...(canCamera ? [TrackSource.CAMERA] : []), ...(canScreenShare ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [])]
          : [];
        await roomService.updateParticipant(roomName, userId, {
          permission: { canSubscribe: true, canPublish: sources.length > 0, canPublishSources: sources, canPublishData: true },
        });
      }
    }
    if (status) {
      await db.execute(
        `INSERT INTO stream_speakers (streamId, userId, status, canCamera, canScreenShare, updatedAt)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(streamId, userId) DO UPDATE SET status = excluded.status, canCamera = excluded.canCamera,
           canScreenShare = excluded.canScreenShare, updatedAt = excluded.updatedAt`,
        [streamId, userId, status, canCamera, canScreenShare, Date.now()]
      );
    } else {
      await db.execute("DELETE FROM stream_speakers WHERE streamId = $1 AND userId = $2", [streamId, userId]);
    }
    hub.broadcastStream(streamId, { t: "live_room", streamId });
    hub.sendToUser(userId, { t: "live_room", streamId });
  },

  async hostPresence(streamId: string, connected: boolean) {
    const stream = await Streams.byId(streamId);
    if (!stream?.isLive) return;
    const now = Date.now();
    await db.execute(
      `INSERT INTO stream_presence (streamId, hostConnected, hostDisconnectedAt, updatedAt) VALUES ($1,$2,$3,$4)
       ON CONFLICT(streamId) DO UPDATE SET hostConnected = excluded.hostConnected,
         hostDisconnectedAt = CASE WHEN excluded.hostConnected = $5 THEN NULL
           ELSE COALESCE(stream_presence.hostDisconnectedAt, excluded.hostDisconnectedAt) END,
         updatedAt = excluded.updatedAt`,
      [streamId, connected, connected ? null : now, now, true]
    );
    hub.broadcastStream(streamId, { t: "live_room", streamId });
  },

  async reconcilePresence() {
    if (!roomService) return;
    for (const stream of await Streams.live()) {
      try {
        const name = roomNameForStream(stream.id);
        const [room] = await roomService.listRooms([name]);
        const connected = room ? (await roomService.listParticipants(name)).some((participant) => participant.identity === stream.creatorId) : false;
        const state = await this.state(stream.id);
        if (connected !== state.hostConnected || (!connected && state.hostDisconnectedAt == null)) {
          await this.hostPresence(stream.id, connected);
        }
      } catch {
        // A LiveKit control-plane outage must not end a healthy stream.
      }
    }
  },

  async endExpired() {
    const rows = await db.query<{ streamId: string }>(
      `SELECT p.streamId AS "streamId" FROM stream_presence p JOIN streams s ON s.id = p.streamId
       WHERE s.isLive = $1 AND p.hostConnected = $2 AND p.hostDisconnectedAt IS NOT NULL AND p.hostDisconnectedAt <= $3`,
      [true, false, Date.now() - graceMs]
    );
    for (const { streamId } of rows) {
      const ended = await db.execute(
        `UPDATE streams SET isLive = $1, endedAt = $2 WHERE id = $3 AND isLive = $4 AND EXISTS (
           SELECT 1 FROM stream_presence p WHERE p.streamId = streams.id AND p.hostConnected = $5
             AND p.hostDisconnectedAt IS NOT NULL AND p.hostDisconnectedAt <= $6)`,
        [false, Date.now(), streamId, true, false, Date.now() - graceMs]
      );
      if (!ended) continue;
      const recording = await Streams.recording(streamId);
      await stopStreamRecording(recording?.egressId ?? null);
      hub.broadcastStream(streamId, { t: "live_room", streamId });
    }
  },
};
