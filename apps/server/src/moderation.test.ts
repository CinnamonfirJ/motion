import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateDatabase, db } from "./db.js";
import { Users, Streams } from "./store.js";
import { Moderation } from "./moderation.js";

test("moderation: ban/unban, enforcement flag, and timeout expiry", async () => {
  await migrateDatabase();
  const tag = Math.random().toString(36).slice(2);
  const host = await Users.create({ authId: `h_${tag}`, displayName: "Host", handle: `h${tag}`, avatarUrl: null, walletAddress: "0x0", isCreator: true });
  const viewer = await Users.create({ authId: `v_${tag}`, displayName: "Viewer", handle: `v${tag}`, avatarUrl: null, walletAddress: "0x0", isCreator: false });
  const streamId = `s_${tag}`;
  await Streams.upsert({ id: streamId, creatorId: host.id, title: "t", videoUrl: "", durationSec: 0, thumbnailUrl: null, startedAt: Date.now(), isLive: true, createdAt: Date.now() });

  // permanent ban → enforced, listed, then removed
  assert.equal(await Moderation.isBanned(streamId, viewer.id), false);
  await Moderation.apply(streamId, viewer.id, "ban", host.id);
  assert.equal(await Moderation.isBanned(streamId, viewer.id), true);
  assert.equal((await Moderation.list(streamId)).length, 1);
  await Moderation.remove(streamId, viewer.id);
  assert.equal(await Moderation.isBanned(streamId, viewer.id), false);

  // timeout that has already passed → lazily cleared (auto-expiry)
  await Moderation.apply(streamId, viewer.id, "timeout", host.id, 1000);
  assert.equal(await Moderation.isBanned(streamId, viewer.id), true);
  await db.execute("UPDATE stream_bans SET expiresAt = $1 WHERE streamId = $2 AND userId = $3", [Date.now() - 1000, streamId, viewer.id]);
  assert.equal(await Moderation.isBanned(streamId, viewer.id), false);
  assert.equal((await Moderation.list(streamId)).length, 0);
});
