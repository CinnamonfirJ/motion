import { test } from "node:test";
import assert from "node:assert/strict";
import { hub, type SocketLike } from "./realtime.js";

function fakeSocket(): SocketLike {
  return { readyState: 1, send() {}, close() {}, on() {} };
}

test("hub analytics: viewers, peak, unique, and real watch time from sessions", async () => {
  const stream = `s_${Math.random().toString(36).slice(2)}`;
  const c1 = hub.add(fakeSocket(), null);
  const c2 = hub.add(fakeSocket(), null);
  hub.subscribe(c1, stream);
  hub.subscribe(c2, stream);
  hub.authenticate(c1, "userA");
  hub.authenticate(c2, "userB");

  let s = hub.streamStats(stream);
  assert.equal(s.current, 2);
  assert.equal(s.peak, 2);
  assert.equal(s.unique, 2);

  await new Promise((r) => setTimeout(r, 30));
  hub.unsubscribe(c1, stream);

  s = hub.streamStats(stream);
  assert.equal(s.current, 1);          // one left
  assert.equal(s.peak, 2);             // peak retained after a viewer leaves
  assert.equal(s.unique, 2);           // unique viewers persist
  assert.ok(s.watchMs >= 20, `expected accrued watch time, got ${s.watchMs}ms`);

  // idempotent subscribe: re-subscribing the same conn must not create a second session
  hub.subscribe(c2, stream);
  assert.equal(hub.streamStats(stream).current, 1);
});

test("hub sends curator celebrations only while the websocket is authenticated", () => {
  const sent: string[] = [];
  const socket: SocketLike = { readyState: 1, send(data) { sent.push(data); }, close() {}, on() {} };
  const conn = hub.add(socket, null);
  const userId = `curator_${Math.random().toString(36).slice(2)}`;
  const event = {
    t: "curator" as const,
    momentId: "moment",
    streamId: "stream",
    rank: 1,
    rewardUnits: "1",
    rewardUsd: "$0.00",
  };

  hub.authenticate(conn, userId);
  hub.sendToUser(userId, event);
  assert.equal(sent.length, 1);

  hub.unauthenticate(conn);
  hub.sendToUser(userId, event);
  assert.equal(sent.length, 1);
});
