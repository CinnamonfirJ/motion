import type { FastifyInstance, FastifyRequest } from "fastify";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { newId, type User } from "@ennoia/core";
import { createHmac } from "node:crypto";
import { db } from "./db.js";
import { env } from "./env.js";
import { Moments, Streams, Users } from "./store.js";
import { momentViews, streamView } from "./view.js";
import { hub } from "./realtime.js";

type Auth = (request: FastifyRequest) => Promise<User | null>;
type Row = Record<string, unknown>;
const val = (row: Row, key: string) => row[key] ?? row[key.toLowerCase()];
const str = (row: Row, key: string) => String(val(row, key) ?? "");
const num = (row: Row, key: string) => Number(val(row, key) ?? 0);

const mediaTypes = new Map([
  ["image/jpeg", { ext: "jpg", max: 15_000_000 }],
  ["image/png", { ext: "png", max: 15_000_000 }],
  ["image/webp", { ext: "webp", max: 15_000_000 }],
  ["video/mp4", { ext: "mp4", max: 150_000_000 }],
  ["video/webm", { ext: "webm", max: 150_000_000 }],
]);
const s3 = env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
  ? new S3Client({
      endpoint: env.R2_ENDPOINT,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
      // R2 doesn't support the AWS SDK v3 default flexible checksums, which otherwise inject an
      // (empty-body) x-amz-checksum-crc32 into presigned PUT URLs and make browser uploads fail.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;

function mediaUrl(key: string) {
  return `${env.R2_PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Account deletion retries this until every uploaded object and its database record are gone. */
export async function deleteUserPostMedia(userId: string): Promise<void> {
  const rows = await db.query<Row>("SELECT id, objectKey FROM post_uploads WHERE ownerId = $1", [userId]);
  if (rows.length && (!s3 || !env.R2_BUCKET)) throw new Error("post-media-cleanup-not-configured");
  for (const row of rows) {
    await s3!.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: str(row, "objectKey") }));
    await db.execute("DELETE FROM post_uploads WHERE id = $1 AND ownerId = $2", [str(row, "id"), userId]);
  }
}

function validUrl(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

async function blockedSet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db.query<Row>("SELECT blockerId, blockedId FROM blocked_users WHERE blockerId = $1 OR blockedId = $1", [userId]);
  return new Set(rows.map((row) => str(row, str(row, "blockerId") === userId ? "blockedId" : "blockerId")));
}

const postSelect = `SELECT p.*, u.displayName AS "displayName", u.handle, u.avatarUrl AS "avatarUrl",
  (SELECT COUNT(*) FROM post_likes l WHERE l.postId = p.id) AS "likeCount",
  (SELECT COUNT(*) FROM posts r WHERE r.replyToId = p.id AND r.deletedAt IS NULL) AS "replyCount",
  (SELECT COUNT(*) FROM posts r WHERE r.repostOfId = p.id AND r.deletedAt IS NULL) AS "repostCount",
  (SELECT COUNT(*) FROM post_views v WHERE v.postId = p.id) AS "viewCount"
  FROM posts p JOIN users u ON u.id = p.authorId`;

function postDto(row: Row, viewerId: string | null, likedIds: Set<string>) {
  let media: string[] = [];
  try { media = JSON.parse(str(row, "mediaJson")); } catch { /* malformed legacy data */ }
  return {
    id: str(row, "id"), author: {
      id: str(row, "authorId"), displayName: str(row, "displayName"),
      handle: str(row, "handle"), avatarUrl: val(row, "avatarUrl") || null,
    },
    body: str(row, "body"), media, linkUrl: val(row, "linkUrl") || null,
    streamId: val(row, "streamId") || null, momentId: val(row, "momentId") || null,
    communityId: val(row, "communityId") || null, replyToId: val(row, "replyToId") || null,
    quotePostId: val(row, "quotePostId") || null, repostOfId: val(row, "repostOfId") || null,
    createdAt: num(row, "createdAt"), likes: num(row, "likeCount"),
    replies: num(row, "replyCount"), reposts: num(row, "repostCount"), views: num(row, "viewCount"),
    liked: viewerId ? likedIds.has(str(row, "id")) : false,
  };
}

async function hydratePosts(rows: Row[], viewerId: string | null) {
  const ids = rows.map((row) => str(row, "id"));
  const liked = new Set<string>();
  if (viewerId && ids.length) {
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(",");
    const likes = await db.query<Row>(`SELECT postId FROM post_likes WHERE userId = $1 AND postId IN (${placeholders})`, [viewerId, ...ids]);
    for (const row of likes) liked.add(str(row, "postId"));
  }
  return rows.map((row) => postDto(row, viewerId, liked));
}

async function visiblePost(id: string, viewerId: string | null) {
  const [row] = await db.query<Row>(`${postSelect} WHERE p.id = $1 AND p.deletedAt IS NULL`, [id]);
  if (!row) return null;
  const blocked = await blockedSet(viewerId);
  return blocked.has(str(row, "authorId")) ? null : (await hydratePosts([row], viewerId))[0];
}

export async function registerSocialRoutes(app: FastifyInstance, auth: Auth) {
  app.post("/media/post-upload", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!s3 || !env.R2_BUCKET || !env.R2_PUBLIC_BASE_URL) return reply.code(503).send({ error: "media-not-configured" });
    const body = (req.body ?? {}) as { contentType?: string; sizeBytes?: number };
    const spec = mediaTypes.get(body.contentType ?? "");
    if (!spec || !Number.isInteger(body.sizeBytes) || body.sizeBytes! < 1 || body.sizeBytes! > spec.max) {
      return reply.code(400).send({ error: "invalid-media-type-or-size" });
    }
    const id = newId("upl");
    const key = `posts/${user.id}/${id}.${spec.ext}`;
    await db.execute(
      "INSERT INTO post_uploads (id, ownerId, objectKey, contentType, maxBytes, createdAt) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, user.id, key, body.contentType!, body.sizeBytes!, Date.now()]
    );
    // pnpm may resolve adjacent Smithy type versions for the two AWS SDK packages.
    const command = new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: body.contentType });
    const uploadUrl = await getSignedUrl(
      s3 as unknown as Parameters<typeof getSignedUrl>[0],
      command as unknown as Parameters<typeof getSignedUrl>[1],
      { expiresIn: 300 }
    );
    return { uploadId: id, uploadUrl, publicUrl: mediaUrl(key), contentType: body.contentType, expiresInSec: 300 };
  });

  // Server-side image upload: the client POSTs the raw image bytes here and we upload to R2 with
  // our own credentials, so the browser never makes a cross-origin PUT (no R2 CORS needed). The
  // row it writes is identical to the presigned flow's, so POST /posts accepts the returned uploadId
  // unchanged. Images only (the binary parser caps the body at 16MB); videos use /media/post-upload.
  app.post("/media/post-upload-direct", { bodyLimit: 16_000_000 }, async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!s3 || !env.R2_BUCKET || !env.R2_PUBLIC_BASE_URL) return reply.code(503).send({ error: "media-not-configured" });
    const contentType = String(req.headers["content-type"] ?? "").split(";")[0]!.trim();
    const spec = mediaTypes.get(contentType);
    if (!spec || (spec.ext !== "jpg" && spec.ext !== "png" && spec.ext !== "webp")) {
      return reply.code(400).send({ error: "invalid-media-type (images only)" });
    }
    const bytes = req.body as unknown;
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > spec.max) {
      return reply.code(400).send({ error: "invalid-media-size" });
    }
    const id = newId("upl");
    const key = `posts/${user.id}/${id}.${spec.ext}`;
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: bytes, ContentType: contentType }));
    await db.execute(
      "INSERT INTO post_uploads (id, ownerId, objectKey, contentType, maxBytes, createdAt) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, user.id, key, contentType, bytes.length, Date.now()]
    );
    return reply.code(201).send({ uploadId: id, publicUrl: mediaUrl(key), contentType });
  });

  app.post("/posts", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as {
      text?: string; uploadIds?: string[]; linkUrl?: string; streamId?: string; momentId?: string;
      communityId?: string; replyToId?: string; quotePostId?: string; repostOfId?: string;
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const [recent] = await db.query<Row>("SELECT COUNT(*) AS count FROM posts WHERE authorId = $1 AND createdAt >= $2", [user.id, Date.now() - 60_000]);
    if (num(recent ?? {}, "count") >= 10) return reply.code(429).send({ error: "post-rate-limited" });
    if (text.length > 2800) return reply.code(400).send({ error: "post-too-long" });
    const ids = body.uploadIds ?? [];
    if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string")) {
      return reply.code(400).send({ error: "invalid-media" });
    }
    const linkUrl = validUrl(body.linkUrl);
    if (body.linkUrl && !linkUrl) return reply.code(400).send({ error: "https-link-required" });
    const embeds = [body.streamId, body.momentId, body.quotePostId, body.repostOfId].filter(Boolean);
    if (embeds.length > 1) return reply.code(400).send({ error: "one-embed-per-post" });
    if (!text && !ids.length && !linkUrl && !embeds.length) return reply.code(400).send({ error: "empty-post" });
    if (body.repostOfId && (text || ids.length || linkUrl || body.communityId || body.replyToId)) {
      return reply.code(400).send({ error: "repost-cannot-have-content" });
    }
    if (body.streamId && !await Streams.byId(body.streamId)) return reply.code(404).send({ error: "stream-not-found" });
    if (body.momentId) {
      const moment = await Moments.byId(body.momentId);
      if (!moment) return reply.code(404).send({ error: "moment-not-found" });
      if (moment.state !== "PUBLISHED" && moment.state !== "SETTLED") return reply.code(409).send({ error: "moment-not-public" });
    }
    for (const reference of [body.replyToId, body.quotePostId, body.repostOfId]) {
      if (reference && !await visiblePost(reference, user.id)) return reply.code(404).send({ error: "post-not-found" });
    }
    if (body.communityId) {
      const [membership] = await db.query<Row>(
        "SELECT communityId FROM community_members WHERE communityId = $1 AND userId = $2", [body.communityId, user.id]
      );
      if (!membership) return reply.code(403).send({ error: "join-community-first" });
    }
    const uploads: { id: string; key: string; type: string }[] = [];
    if (ids.length && (!s3 || !env.R2_BUCKET)) return reply.code(503).send({ error: "media-not-configured" });
    for (const uploadId of ids) {
      const [row] = await db.query<Row>(
        "SELECT * FROM post_uploads WHERE id = $1 AND ownerId = $2 AND usedAt IS NULL", [uploadId, user.id]
      );
      if (!row) return reply.code(400).send({ error: "upload-not-found-or-used" });
      const head = await s3!.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: str(row, "objectKey") })).catch(() => null);
      if (!head || !head.ContentLength || head.ContentLength > num(row, "maxBytes") || head.ContentType !== str(row, "contentType")) {
        return reply.code(400).send({ error: "upload-incomplete-or-invalid" });
      }
      uploads.push({ id: uploadId, key: str(row, "objectKey"), type: str(row, "contentType") });
    }
    if (uploads.some((item) => item.type.startsWith("video/")) && uploads.length > 1) {
      return reply.code(400).send({ error: "one-video-per-post" });
    }
    const postId = newId("post");
    const now = Date.now();
    try {
      await db.transaction(async (tx) => {
        for (const upload of uploads) {
          const changed = await tx.execute("UPDATE post_uploads SET usedAt = $1 WHERE id = $2 AND ownerId = $3 AND usedAt IS NULL", [now, upload.id, user.id]);
          if (!changed) throw new Error("upload-already-used");
        }
        await tx.execute(
          `INSERT INTO posts (id, authorId, body, mediaJson, linkUrl, streamId, momentId, communityId, replyToId, quotePostId, repostOfId, createdAt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [postId, user.id, text, JSON.stringify(uploads.map((upload) => mediaUrl(upload.key))), linkUrl,
            body.streamId ?? null, body.momentId ?? null, body.communityId ?? null, body.replyToId ?? null,
            body.quotePostId ?? null, body.repostOfId ?? null, now]
        );
      });
    } catch (error) {
      if (body.repostOfId) return reply.code(409).send({ error: "already-reposted" });
      throw error;
    }
    hub.broadcastStream("feed", { t: "feed", postId });
    return reply.code(201).send({ post: await visiblePost(postId, user.id) });
  });

  app.get("/posts/:id", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    const post = await visiblePost(id, user?.id ?? null);
    if (!post) return reply.code(404).send({ error: "post-not-found" });
    return { post };
  });

  app.get("/posts/:id/replies", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    if (!await visiblePost(id, user?.id ?? null)) return reply.code(404).send({ error: "post-not-found" });
    const blocked = await blockedSet(user?.id ?? null);
    const rows = (await db.query<Row>(`${postSelect} WHERE p.replyToId = $1 AND p.deletedAt IS NULL ORDER BY p.createdAt ASC LIMIT 100`, [id]))
      .filter((row) => !blocked.has(str(row, "authorId")));
    return { posts: await hydratePosts(rows, user?.id ?? null) };
  });

  app.post("/posts/:id/view", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    if (!await visiblePost(id, user?.id ?? null)) return reply.code(404).send({ error: "post-not-found" });
    const viewerKey = user ? `user:${user.id}` : `anon:${createHmac("sha256", env.JWT_SECRET).update(`${req.ip}|${req.headers["user-agent"] ?? ""}`).digest("hex")}`;
    await db.execute("INSERT INTO post_views (postId, viewerKey, viewedAt) VALUES ($1,$2,$3) ON CONFLICT(postId, viewerKey) DO NOTHING", [id, viewerKey, Date.now()]);
    return { ok: true };
  });

  app.put("/posts/:id/like", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (!await visiblePost(id, user.id)) return reply.code(404).send({ error: "post-not-found" });
    await db.execute("INSERT INTO post_likes (postId, userId, createdAt) VALUES ($1,$2,$3) ON CONFLICT(postId, userId) DO NOTHING", [id, user.id, Date.now()]);
    return { ok: true };
  });
  app.delete("/posts/:id/like", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    await db.execute("DELETE FROM post_likes WHERE postId = $1 AND userId = $2", [id, user.id]);
    return { ok: true };
  });
  app.delete("/posts/:id", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const changed = await db.execute("UPDATE posts SET deletedAt = $1 WHERE id = $2 AND authorId = $3 AND deletedAt IS NULL", [Date.now(), id, user.id]);
    return changed ? { ok: true } : reply.code(404).send({ error: "post-not-found" });
  });

  app.get("/users/:id/social", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    if (!(await db.query<Row>("SELECT id FROM users WHERE id = $1", [id])).length) return reply.code(404).send({ error: "user-not-found" });
    const [followers, following, posts, followed] = await Promise.all([
      db.query<Row>("SELECT COUNT(*) AS count FROM follows WHERE followingId = $1", [id]),
      db.query<Row>("SELECT COUNT(*) AS count FROM follows WHERE followerId = $1", [id]),
      db.query<Row>("SELECT COUNT(*) AS count FROM posts WHERE authorId = $1 AND deletedAt IS NULL", [id]),
      user ? db.query<Row>("SELECT followingId FROM follows WHERE followerId = $1 AND followingId = $2", [user.id, id]) : Promise.resolve([]),
    ]);
    return {
      followers: num(followers[0] ?? {}, "count"),
      following: num(following[0] ?? {}, "count"),
      posts: num(posts[0] ?? {}, "count"),
      followedByMe: followed.length > 0,
    };
  });

  app.get("/users/:id", async (req, reply) => {
    const viewer = await auth(req);
    const { id } = req.params as { id: string };
    if ((await blockedSet(viewer?.id ?? null)).has(id)) return reply.code(403).send({ error: "blocked-user" });
    const user = await Users.byId(id);
    if (!user) return reply.code(404).send({ error: "user-not-found" });
    return { user: { id: user.id, displayName: user.displayName, handle: user.handle, avatarUrl: user.avatarUrl } };
  });

  app.get("/users/:id/posts", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    if ((await blockedSet(user?.id ?? null)).has(id)) return reply.code(403).send({ error: "blocked-user" });
    const rows = await db.query<Row>(`${postSelect} WHERE p.authorId = $1 AND p.deletedAt IS NULL ORDER BY p.createdAt DESC LIMIT 50`, [id]);
    return { posts: await hydratePosts(rows, user?.id ?? null) };
  });

  app.get("/feed", async (req, reply) => {
    const user = await auth(req);
    const query = req.query as { mode?: string; communityId?: string; before?: string; limit?: string };
    const mode = query.mode === "following" ? "following" : "for-you";
    if (mode === "following" && !user) return reply.code(401).send({ error: "unauthorized" });
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const before = Number(query.before) || Date.now() + 1;
    const communityId = query.communityId || null;
    if (communityId && !await db.query<Row>("SELECT id FROM communities WHERE id = $1", [communityId]).then((rows) => rows.length)) {
      return reply.code(404).send({ error: "community-not-found" });
    }
    const rows = await db.query<Row>(
      `${postSelect} WHERE p.deletedAt IS NULL AND p.createdAt < $1
       AND (CAST($2 AS TEXT) IS NULL OR p.communityId = $2)
       AND ($3 = 'for-you' OR p.authorId = $4 OR EXISTS
         (SELECT 1 FROM follows f WHERE f.followerId = $4 AND f.followingId = p.authorId))
       ORDER BY p.createdAt DESC LIMIT $5`,
      [before, communityId, mode, user?.id ?? "", limit * 3]
    );
    const blocked = await blockedSet(user?.id ?? null);
    const posts = await hydratePosts(rows.filter((row) => !blocked.has(str(row, "authorId"))).slice(0, limit), user?.id ?? null);
    const items: Array<{ type: "post" | "stream" | "moment"; createdAt: number; score: number; post?: unknown; stream?: unknown; moment?: unknown }> = posts.map((post) => ({
      type: "post", createdAt: post.createdAt,
      score: (10 + post.likes * 2 + post.replies * 3 + post.reposts * 4 + Math.min(post.views, 1000) * 0.02) / Math.pow(1 + (Date.now() - post.createdAt) / 3_600_000, 0.8),
      post,
    }));
    if (!communityId && before > Date.now() - 60_000) {
      const followed = new Set(user ? (await db.query<Row>("SELECT followingId FROM follows WHERE followerId = $1", [user.id])).map((row) => str(row, "followingId")) : []);
      const eligible = (authorId: string) => !blocked.has(authorId) && (mode === "for-you" || authorId === user?.id || followed.has(authorId));
      // Enrich streams + moments concurrently (each view does several lookups) so the feed isn't
      // gated on a long sequential chain.
      const [live, publicMoments] = await Promise.all([
        Streams.live().then((streams) => streams.filter((stream) => eligible(stream.creatorId)).slice(0, 10)),
        Moments.publicFeed(12).then((moments) => moments.filter((moment) => eligible(moment.creatorId))),
      ]);
      const [streamItems, momentViewsList] = await Promise.all([
        Promise.all(live.map(async (stream) => ({ type: "stream" as const, createdAt: stream.startedAt, score: 18, stream: await streamView(stream, hub.viewerCount(stream.id)) }))),
        momentViews(publicMoments),
      ]);
      const momentItems = momentViewsList.map((moment, i) => ({
        type: "moment" as const,
        createdAt: publicMoments[i]!.confirmedAt ?? publicMoments[i]!.createdAt,
        score: 12 / Math.pow(1 + (Date.now() - (publicMoments[i]!.confirmedAt ?? publicMoments[i]!.createdAt)) / 3_600_000, 0.8),
        moment,
      }));
      items.push(...streamItems, ...momentItems);
    }
    if (mode === "for-you" && !communityId) items.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
    else items.sort((a, b) => b.createdAt - a.createdAt);
    return { items, nextBefore: posts.length ? Math.min(...posts.map((post) => post.createdAt)) : null };
  });

  app.put("/users/:id/follow", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (id === user.id) return reply.code(400).send({ error: "cannot-follow-self" });
    if (!(await db.query<Row>("SELECT id FROM users WHERE id = $1", [id])).length) return reply.code(404).send({ error: "user-not-found" });
    if ((await blockedSet(user.id)).has(id)) return reply.code(403).send({ error: "blocked-user" });
    await db.execute("INSERT INTO follows (followerId, followingId, createdAt) VALUES ($1,$2,$3) ON CONFLICT(followerId, followingId) DO NOTHING", [user.id, id, Date.now()]);
    return { ok: true };
  });
  app.delete("/users/:id/follow", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    await db.execute("DELETE FROM follows WHERE followerId = $1 AND followingId = $2", [user.id, id]);
    return { ok: true };
  });

  app.get("/communities", async () => {
    const rows = await db.query<Row>(
      `SELECT c.*, (SELECT COUNT(*) FROM community_members cm WHERE cm.communityId = c.id) AS "memberCount"
       FROM communities c ORDER BY c.createdAt DESC LIMIT 100`
    );
    return { communities: rows.map((row) => ({ id: str(row, "id"), slug: str(row, "slug"), name: str(row, "name"), description: str(row, "description"), memberCount: num(row, "memberCount") })) };
  });
  app.get("/communities/:id", async (req, reply) => {
    const user = await auth(req);
    const { id } = req.params as { id: string };
    const [row] = await db.query<Row>(
      `SELECT c.*, (SELECT COUNT(*) FROM community_members cm WHERE cm.communityId = c.id) AS "memberCount"
       FROM communities c WHERE c.id = $1 OR c.slug = $1`, [id]
    );
    if (!row) return reply.code(404).send({ error: "community-not-found" });
    const member = user ? (await db.query<Row>("SELECT userId FROM community_members WHERE communityId = $1 AND userId = $2", [str(row, "id"), user.id])).length > 0 : false;
    return { community: { id: str(row, "id"), slug: str(row, "slug"), name: str(row, "name"), description: str(row, "description"), ownerId: str(row, "ownerId"), memberCount: num(row, "memberCount"), member } };
  });
  app.post("/communities", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { name?: string; description?: string };
    const name = body.name?.trim() ?? "";
    const [recent] = await db.query<Row>("SELECT COUNT(*) AS count FROM communities WHERE ownerId = $1 AND createdAt >= $2", [user.id, Date.now() - 86_400_000]);
    if (num(recent ?? {}, "count") >= 3) return reply.code(429).send({ error: "community-rate-limited" });
    const description = body.description?.trim() ?? "";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    if (name.length < 3 || name.length > 60 || description.length > 500 || slug.length < 3) return reply.code(400).send({ error: "invalid-community" });
    const id = newId("community");
    const now = Date.now();
    try {
      await db.transaction(async (tx) => {
        await tx.execute("INSERT INTO communities (id, slug, name, description, ownerId, createdAt) VALUES ($1,$2,$3,$4,$5,$6)", [id, slug, name, description, user.id, now]);
        await tx.execute("INSERT INTO community_members (communityId, userId, joinedAt) VALUES ($1,$2,$3)", [id, user.id, now]);
      });
    } catch { return reply.code(409).send({ error: "community-name-taken" }); }
    return reply.code(201).send({ community: { id, slug, name, description, memberCount: 1 } });
  });
  app.put("/communities/:id/join", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (!(await db.query<Row>("SELECT id FROM communities WHERE id = $1", [id])).length) return reply.code(404).send({ error: "community-not-found" });
    await db.execute("INSERT INTO community_members (communityId, userId, joinedAt) VALUES ($1,$2,$3) ON CONFLICT(communityId, userId) DO NOTHING", [id, user.id, Date.now()]);
    return { ok: true };
  });
  app.delete("/communities/:id/join", async (req, reply) => {
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    await db.execute("DELETE FROM community_members WHERE communityId = $1 AND userId = $2", [id, user.id]);
    return { ok: true };
  });
}
