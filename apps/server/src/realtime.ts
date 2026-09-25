import type { ReactionType } from "@ennoia/core";

/** Minimal structural type for a ws WebSocket (avoids depending on @types/ws). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
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
  | { t: "viewers"; streamId: string; count: number }
  | { t: "live_room"; streamId: string }
  | { t: "chat"; streamId: string; serverBroadcastAt?: number; message: { id: string; body: string; createdAt: number; clientId?: string; author: { id: string; displayName: string; handle: string; avatarUrl: string | null } } }
  | { t: "chat_deleted"; streamId: string; messageId: string }
  | { t: "moderation"; streamId: string; userId: string; banned: boolean }
  | { t: "ping"; serverTime: number }
  | { t: "feed"; postId: string };

interface Conn {
  ws: SocketLike;
  userId: string | null;
  streams: Set<string>;
  lastSeen: number;
}

const STALE_MS = 60_000;

interface StreamMeta {
  peak: number;
  watchMs: number;            // settled watch time (closed sessions)
  unique: Set<string>;        // distinct authenticated viewer ids
  sessions: Map<Conn, number>; // active viewer → session start ts
}

class Hub {
  private conns = new Set<Conn>();
  private streamMeta = new Map<string, StreamMeta>();

  private meta(streamId: string): StreamMeta {
    let m = this.streamMeta.get(streamId);
    if (!m) { m = { peak: 0, watchMs: 0, unique: new Set(), sessions: new Map() }; this.streamMeta.set(streamId, m); }
    return m;
  }

  add(ws: SocketLike, userId: string | null): Conn {
    const conn: Conn = { ws, userId, streams: new Set(), lastSeen: Date.now() };
    this.conns.add(conn);
    ws.on("close", () => this.remove(conn));
    ws.on("error", () => this.remove(conn));
    return conn;
  }

  private remove(conn: Conn): void {
    const streams = [...conn.streams];
    for (const s of streams) this.endSession(conn, s);
    conn.streams.clear();
    this.conns.delete(conn);
    for (const s of streams) this.broadcastViewerCount(s);
  }

  private endSession(conn: Conn, streamId: string): void {
    const m = this.streamMeta.get(streamId);
    const start = m?.sessions.get(conn);
    if (m && start != null) { m.watchMs += Date.now() - start; m.sessions.delete(conn); }
  }

  /** Real per-stream analytics accumulated from connection sessions (never viewers×duration). */
  streamStats(streamId: string): { current: number; peak: number; unique: number; watchMs: number } {
    const current = this.viewerCount(streamId);
    const m = this.streamMeta.get(streamId);
    if (!m) return { current, peak: current, unique: 0, watchMs: 0 };
    const now = Date.now();
    let live = 0;
    for (const start of m.sessions.values()) live += now - start;
    return { current, peak: Math.max(m.peak, current), unique: m.unique.size, watchMs: m.watchMs + live };
  }

  /** Any inbound frame (subscribe/auth/pong) marks the connection alive. */
  touch(conn: Conn): void {
    conn.lastSeen = Date.now();
  }

  /**
   * Keepalive: push a ping to every connection and drop ones that have gone silent past the
   * stale window. Prevents proxy idle-close leaving half-open sockets (the ~30s chat delay).
   */
  heartbeat(): void {
    const now = Date.now();
    const payload = JSON.stringify({ t: "ping", serverTime: now } satisfies ServerEvent);
    for (const c of this.conns) {
      if (now - c.lastSeen > STALE_MS) {
        try { c.ws.close(4000, "stale"); } catch { /* ignore */ }
        this.conns.delete(c);
        continue;
      }
      this.safeSend(c, payload);
    }
  }

  authenticate(conn: Conn, userId: string): void {
    conn.userId = userId;
    conn.lastSeen = Date.now();
    for (const s of conn.streams) this.streamMeta.get(s)?.unique.add(userId); // count late auth
  }

  subscribe(conn: Conn, streamId: string) {
    if (conn.streams.has(streamId)) return; // idempotent — one session per (conn, stream)
    conn.streams.add(streamId);
    const m = this.meta(streamId);
    m.sessions.set(conn, Date.now());
    if (conn.userId) m.unique.add(conn.userId);
    const current = this.viewerCount(streamId);
    if (current > m.peak) m.peak = current;
    this.broadcastViewerCount(streamId);
  }

  unsubscribe(conn: Conn, streamId: string) {
    if (!conn.streams.has(streamId)) return;
    conn.streams.delete(streamId);
    this.endSession(conn, streamId);
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
