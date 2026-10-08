import { api, getToken } from "./api";
import { computeClockOffset, serverNow } from "@ennoia/core";

/**
 * Single WebSocket connection + authoritative clock offset (PRD §8/§33/§40).
 * Components subscribe to stream/user events; the clock offset lets the client derive
 * server time (hence stream position + reaction timestamps) without trusting its own clock.
 */
type Handler = (ev: any) => void;

class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private subscribed = new Set<string>();
  private clockOffset = 0;
  private reconnectTimer: any = null;
  private watchdog: any = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(api.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.authenticate();
      for (const s of this.subscribed) ws.send(JSON.stringify({ type: "subscribe", streamId: s }));
      this.armWatchdog();
    };
    ws.onmessage = (e) => {
      // Any inbound frame proves the socket is alive (server pings every 25s). If nothing arrives
      // for 45s the socket is half-open — force a reconnect so realtime never silently stalls.
      this.armWatchdog();
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg?.t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* ignore */ } return; }
      for (const h of this.handlers) h(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.clearWatchdog();
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private armWatchdog() {
    this.clearWatchdog();
    this.watchdog = setTimeout(() => { try { this.ws?.close(); } catch { /* ignore */ } }, 45_000);
  }
  private clearWatchdog() {
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  subscribe(streamId: string) {
    this.subscribed.add(streamId);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "subscribe", streamId }));
  }
  unsubscribe(streamId: string) {
    this.subscribed.delete(streamId);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "unsubscribe", streamId }));
  }
  authenticate() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const token = getToken();
    this.ws.send(JSON.stringify(token ? { type: "auth", token } : { type: "logout" }));
  }
  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }

  /** Measure clock offset against the server (NTP-style midpoint). */
  async syncClock() {
    const sent = Date.now();
    const { serverTime } = await fetch(`${(import.meta.env.VITE_API_URL || "http://localhost:4000")}/time`).then((r) => r.json());
    const received = Date.now();
    this.clockOffset = computeClockOffset(sent, serverTime, received);
    return this.clockOffset;
  }
  serverNow() {
    return serverNow(Date.now(), this.clockOffset);
  }
  offset() {
    return this.clockOffset;
  }
}

export const realtime = new Realtime();
