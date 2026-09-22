import type { ReactionType } from "@ennoia/core";

/** Minimal structural type for a ws WebSocket (avoids depending on @types/ws). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  on(event: string, cb: (...args: any[]) => void): void;
}

/**
 * Realtime hub (PRD §33). A reaction from Android affects the same stream activity a web
 * viewer sees. Clients subscribe to a stream and to their own user channel (for personal
 * events like the Founding Curator celebration).
 */

export type ServerEvent =
  | { t: "activity"; streamId: string; ratePerSec: number; recentByType: Record<ReactionType, number>; heatingUp: boolean }
  | { t: "reaction"; streamId: string; reactionType: ReactionType; streamTimeMs: number }
  | { t: "moment"; streamId: string; momentId: string; state: string }
  | { t: "moment_detected"; streamId: string; momentId: string; spikeStreamTimeMs: number }
  | { t: "curator"; momentId: string; rank: number; rewardUnits: string; rewardUsd: string; streamId: string }
  | { t: "settlement"; momentId: string; status: string; txHash: string | null }
  | { t: "viewers"; streamId: string; count: number };

interface Conn {
  ws: SocketLike;
  userId: string | null;
  streams: Set<string>;
}

class Hub {
  private conns = new Set<Conn>();

  add(ws: SocketLike, userId: string | null): Conn {
    const conn: Conn = { ws, userId, streams: new Set() };
    this.conns.add(conn);
    ws.on("close", () => this.conns.delete(conn));
    ws.on("error", () => this.conns.delete(conn));
    return conn;
  }

  subscribe(conn: Conn, streamId: string) {
    conn.streams.add(streamId);
    this.broadcastViewerCount(streamId);
  }

  unsubscribe(conn: Conn, streamId: string) {
    conn.streams.delete(streamId);
    this.broadcastViewerCount(streamId);
  }

  viewerCount(streamId: string): number {
    let n = 0;
    for (const c of this.conns) if (c.streams.has(streamId)) n++;
    return n;
  }

  private broadcastViewerCount(streamId: string) {
    this.broadcastStream(streamId, { t: "viewers", streamId, count: this.viewerCount(streamId) });
  }

  broadcastStream(streamId: string, event: ServerEvent) {
    const payload = JSON.stringify(event);
    for (const c of this.conns) {
      if (c.streams.has(streamId)) this.safeSend(c, payload);
    }
  }

  sendToUser(userId: string, event: ServerEvent) {
    const payload = JSON.stringify(event);
    for (const c of this.conns) {
      if (c.userId === userId) this.safeSend(c, payload);
    }
  }

  private safeSend(c: Conn, payload: string) {
    try {
      if (c.ws.readyState === 1) c.ws.send(payload);
    } catch {
      this.conns.delete(c);
    }
  }
}

export const hub = new Hub();
