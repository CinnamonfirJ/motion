import { api, WS_URL, getToken } from "./api";
import { computeClockOffset, serverNow } from "@moment/core";

/** WebSocket + authoritative clock (mirrors web). RN provides a global WebSocket. */
type Handler = (ev: any) => void;

class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private subscribed = new Set<string>();
  private clockOffset = 0;
  private timer: any = null;

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const token = getToken();
    this.ws = new WebSocket(`${WS_URL}${token ? `?token=${encodeURIComponent(token)}` : ""}`);
    this.ws.onopen = () => {
      for (const s of this.subscribed) this.ws?.send(JSON.stringify({ type: "subscribe", streamId: s }));
    };
    this.ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      for (const h of this.handlers) h(msg);
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.timer) this.timer = setTimeout(() => ((this.timer = null), this.connect()), 1500);
    };
    this.ws.onerror = () => this.ws?.close();
  }
  subscribe(id: string) {
    this.subscribed.add(id);
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: "subscribe", streamId: id }));
  }
  unsubscribe(id: string) {
    this.subscribed.delete(id);
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: "unsubscribe", streamId: id }));
  }
  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }
  async syncClock() {
    const sent = Date.now();
    const { serverTime } = await api.time();
    const received = Date.now();
    this.clockOffset = computeClockOffset(sent, serverTime, received);
    return this.clockOffset;
  }
  serverNow() {
    return serverNow(Date.now(), this.clockOffset);
  }
}
export const realtime = new Realtime();
