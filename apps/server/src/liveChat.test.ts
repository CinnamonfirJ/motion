import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@ennoia/core";
import { LiveChat, CHAT_MAX_LEN } from "./liveChat.js";

const user = (id: string): User => ({ id, authId: `t:${id}`, displayName: id, handle: id, avatarUrl: null, walletAddress: "0x0", isCreator: false, createdAt: 0 });

test("chat build: validation, clientId passthrough, and per-user rate limit", () => {
  const stream = `s_${Math.random().toString(36).slice(2)}`;
  const u = user(`u_${Math.random().toString(36).slice(2)}`);

  // empty / whitespace rejected
  assert.deepEqual(LiveChat.build(stream, u, "   "), { ok: false, error: "empty" });
  // too long rejected
  assert.deepEqual(LiveChat.build(stream, u, "x".repeat(CHAT_MAX_LEN + 1)), { ok: false, error: "too-long" });

  // valid: canonical message with echoed clientId, unique server id, trimmed body
  const r = LiveChat.build(stream, u, "  hello   world  ", "cid-1");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.message.body, "hello world");
    assert.equal(r.message.clientId, "cid-1");
    assert.equal(r.message.author.id, u.id);
    assert.match(r.message.id, /^msg/);
  }

  // rate limit: 6/10s window. The first send above counts as #1; 5 more OK, then limited.
  for (let i = 0; i < 5; i++) assert.equal(LiveChat.build(stream, u, `m${i}`).ok, true);
  assert.deepEqual(LiveChat.build(stream, u, "over"), { ok: false, error: "rate-limited" });

  // a different user in the same stream is NOT rate limited
  assert.equal(LiveChat.build(stream, user("other"), "hi").ok, true);
});
