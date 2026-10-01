import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DEFAULT_CONFIG,
  distributeReward,
  formatUsd,
  newEventId,
  newId,
  type Clip,
  type FoundingCurator,
  type Moment,
  type MomentMetrics,
  type Platform,
  type ReactionType,
  type Settlement,
  type User,
} from "@ennoia/core";
import { db } from "./db.js";
import { env } from "./env.js";
import { deriveWallet } from "./auth.js";
import { Moments } from "./store.js";

/**
 * Demo content seeder (screenshot fixtures) — isolated from product logic.
 *
 * Everything it writes is tagged so it can be removed again with no trace:
 *   - cast users      authId  LIKE 'demo:cast:%'
 *   - streams/moments/posts/reactions  id/eventId LIKE 'demo\_%'
 *
 * It attaches moments + earnings + followers to ONE real account (the handle you
 * sign into the app with), surrounds it with a cast of other accounts that post and
 * react, and uploads the committed seed-assets images to R2 so the app can render
 * them. Earnings are built through the SAME reward split as production
 * (distributeReward 70/20/10, rank-weighted curator pool) so the numbers are
 * internally consistent — only their size is dialled up for the demo.
 */

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), "../seed-assets");
const CAST_AUTH_PREFIX = "demo:cast:";
const REACTIONS: ReactionType[] = ["fire", "laugh", "wow"];
const PLATFORMS: Platform[] = ["web", "ios", "android"];
const SAMPLE_VIDEO = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(n, copy.length));
}
/** USD → reward units at the display peg, keeping cent precision without float overflow. */
const usdUnits = (usd: number): bigint => (BigInt(Math.round(usd * 100)) * env.UNITS_PER_USD) / 100n;

const DAY = 86_400_000;

interface CastMember {
  slug: string;
  name: string;
  handle: string;
  isCreator: boolean;
}

const CAST: CastMember[] = [
  { slug: "pixelriot", name: "Pixel Riot", handle: "pixelriot", isCreator: true },
  { slug: "maralive", name: "Mara", handle: "maralive", isCreator: true },
  { slug: "kodamakes", name: "Koda Makes", handle: "kodamakes", isCreator: true },
  { slug: "lumi", name: "Lumi", handle: "lumiplays", isCreator: true },
  { slug: "sable", name: "Sable", handle: "sablenight", isCreator: true },
  { slug: "nova", name: "Nova", handle: "novacafe", isCreator: false },
  { slug: "wren", name: "Wren", handle: "wren", isCreator: false },
  { slug: "cove", name: "Cove", handle: "coveside", isCreator: false },
  { slug: "iris", name: "Iris", handle: "irisbloom", isCreator: false },
  { slug: "juno", name: "Juno", handle: "junobyte", isCreator: false },
  { slug: "fen", name: "Fen", handle: "fenwild", isCreator: false },
  { slug: "odie", name: "Odie", handle: "odieonline", isCreator: false },
];

const POST_BODIES = [
  "morning setup, dialed in ☕️ what are we grinding today",
  "finally finished the desk — worth every late night",
  "cozy night in with this one 🎮 come hang",
  "breakfast of champions tbh",
  "new fit for the stream tonight 😈",
  "this little game has NO business being this good",
  "elemental combos are actually broken rn, clip incoming",
  "late night build session, lo-fi on, brain off",
  "apple ecosystem got me again… send help 💻",
  "croissant + eggs = undefeated",
  "rebuilt the whole workspace this weekend",
  "stream in 10. bring snacks.",
  "ok who else is addicted to this",
  "pov: you said one more game at 2am",
  "the lighting finally cooperated today ✨",
  "clipping every reaction tonight, don't miss it",
];

const STREAM_TITLES = [
  "Ranked grind — road to the top",
  "Genshin co-op, come vibe",
  "Building something weird on stream",
  "Cozy release — first look 🌼",
  "Late night code + chill",
];

function mediaUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function s3Client(): S3Client {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET || !env.R2_PUBLIC_BASE_URL) {
    throw new Error("demo-seed-requires-r2 (R2_ENDPOINT/ACCESS_KEY/SECRET/BUCKET/PUBLIC_BASE_URL)");
  }
  return new S3Client({
    endpoint: env.R2_ENDPOINT,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
}

/** Upload one local asset to a stable demo key (idempotent — skips if already present). */
async function uploadAsset(s3: S3Client, localRelPath: string, key: string): Promise<string> {
  const exists = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })).then(() => true).catch(() => false);
  if (!exists) {
    const body = readFileSync(resolve(ASSETS, localRelPath));
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: "image/jpeg" }));
  }
  return mediaUrl(key);
}

function r2Configured(): boolean {
  return Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_PUBLIC_BASE_URL);
}

async function uploadImages(): Promise<{ posts: string[]; streams: string[] }> {
  // Local/dev fallback: without R2 we can't host the committed images, so the seed still
  // produces renderable fixtures using deterministic placeholder photos. Production (R2
  // configured) uploads the real images from seed-assets/.
  if (!r2Configured()) {
    return {
      posts: Array.from({ length: 16 }, (_, i) => `https://picsum.photos/seed/ennoia-post-${i + 1}/900/1200`),
      streams: Array.from({ length: 5 }, (_, i) => `https://picsum.photos/seed/ennoia-stream-${i + 1}/1280/720`),
    };
  }
  const s3 = s3Client();
  const posts: string[] = [];
  for (let i = 1; i <= 16; i++) {
    const n = String(i).padStart(2, "0");
    posts.push(await uploadAsset(s3, `posts/post-${n}.jpg`, `demo/posts/post-${n}.jpg`));
  }
  const streams: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const n = String(i).padStart(2, "0");
    streams.push(await uploadAsset(s3, `streams/stream-${n}.jpg`, `demo/streams/stream-${n}.jpg`));
  }
  return { posts, streams };
}

// ---------------------------------------------------------------- reset ----

async function clearDemo(): Promise<void> {
  // FK-safe order: posts reference moments/streams (RESTRICT), so posts go before them;
  // cast users go last (follows/reactions/curators cascade from users on delete).
  await db.execute("DELETE FROM reactions WHERE eventId LIKE 'demo\\_%' ESCAPE '\\'");
  await db.execute("DELETE FROM reactions WHERE streamId LIKE 'demo\\_%' ESCAPE '\\'");
  await db.execute("DELETE FROM posts WHERE id LIKE 'demo\\_%' ESCAPE '\\'");
  await db.execute("DELETE FROM moments WHERE id LIKE 'demo\\_%' ESCAPE '\\'");
  await db.execute("DELETE FROM streams WHERE id LIKE 'demo\\_%' ESCAPE '\\'");
  await db.execute(`DELETE FROM users WHERE authId LIKE '${CAST_AUTH_PREFIX}%'`);
}

// ------------------------------------------------------------- builders ----

function buildMetrics(durationSec: number): MomentMetrics {
  const total = rand(220, 1500);
  const unique = Math.floor(total * (0.45 + Math.random() * 0.3));
  const fire = Math.floor(total * 0.5);
  const laugh = Math.floor(total * 0.3);
  const wow = total - fire - laugh;
  const peakOffsetSec = rand(4, Math.max(5, durationSec - 4));
  const histogram: { second: number; fire: number; laugh: number; wow: number }[] = [];
  for (let s = 0; s < durationSec; s++) {
    const d = Math.max(0.08, 1 - Math.abs(s - peakOffsetSec) / 9);
    histogram.push({
      second: s,
      fire: Math.round((fire / durationSec) * (0.4 + d)),
      laugh: Math.round((laugh / durationSec) * (0.4 + d)),
      wow: Math.round((wow / durationSec) * (0.4 + d)),
    });
  }
  const category = fire >= laugh && fire >= wow ? "Hype" : laugh >= wow ? "Funny" : "Wow";
  return { totalReactions: total, uniqueReactors: unique, mix: { fire, laugh, wow }, peakRate: rand(18, 85), peakOffsetSec, category, histogram };
}

function buildClip(spikeMs: number, posterUrl: string): Clip {
  const durationSec = rand(28, 42);
  return {
    startStreamTimeMs: Math.max(0, spikeMs - 15_000),
    endStreamTimeMs: spikeMs + 20_000,
    durationSec,
    url: posterUrl,
    ready: true,
  };
}

interface SeededMoment {
  moment: Moment;
  curators: FoundingCurator[];
  viewers: string[];
}

/** Build one SETTLED moment with a real reward split; `curatorUsers[0]` is rank #1. */
function buildMoment(opts: {
  streamId: string;
  creatorId: string;
  posterUrl: string;
  totalUsd: number;
  curatorUsers: User[];
  confirmedAt: number;
}): SeededMoment {
  const id = newId("demo_mom");
  const spikeMs = rand(30_000, 480_000);
  const clip = buildClip(spikeMs, opts.posterUrl);
  const curatorCount = opts.curatorUsers.length;
  const total = usdUnits(opts.totalUsd);
  const dist = distributeReward(total, curatorCount, DEFAULT_CONFIG.reward, DEFAULT_CONFIG.curator);
  const settlement: Settlement = {
    momentId: id,
    status: "confirmed",
    txHash: `0x${newId("").replace(/[^a-f0-9]/gi, "").padEnd(64, "0").slice(0, 64)}`,
    creatorAmountUnits: dist.creatorUnits,
    curatorPoolUnits: dist.curatorPoolUnits,
    totalUnits: dist.totalUnits,
    submittedAt: opts.confirmedAt - 4_000,
    confirmedAt: opts.confirmedAt,
    error: null,
  };
  const curators: FoundingCurator[] = opts.curatorUsers.map((u, i) => ({
    momentId: id,
    userId: u.id,
    walletAddress: u.walletAddress,
    rank: i + 1,
    qualifyingStreamTimeMs: spikeMs - rand(200, 2_400) * (i + 1),
    qualifyingServerTimeMs: opts.confirmedAt - rand(8_000, 16_000),
    rewardUnits: dist.curatorUnits[i] ?? 0n,
  }));
  const moment: Moment = {
    id,
    streamId: opts.streamId,
    creatorId: opts.creatorId,
    state: "SETTLED",
    spikeStreamTimeMs: spikeMs,
    detectedAt: opts.confirmedAt - 12_000,
    confirmedAt: opts.confirmedAt,
    clip,
    metrics: buildMetrics(clip.durationSec),
    foundingCurators: curators,
    settlement,
    createdAt: opts.confirmedAt - 14_000,
    updatedAt: opts.confirmedAt,
  };
  return { moment, curators, viewers: opts.curatorUsers.map((u) => u.id) };
}

// ---------------------------------------------------------------- seed -----

export interface SeedResult {
  target: { id: string; handle: string; displayName: string };
  cast: number;
  streams: number;
  posts: number;
  moments: number;
  reactions: number;
  followers: number;
  creatorEarningsUsd: string;
  scoutEarningsUsd: string;
}

export async function seedDemo(opts: { targetHandle: string; reset?: boolean }): Promise<SeedResult> {
  const handle = opts.targetHandle.trim().replace(/^@/, "").toLowerCase();
  const [targetRow] = await db.query<Record<string, unknown>>(
    "SELECT * FROM users WHERE LOWER(handle) = $1",
    [handle]
  );
  if (!targetRow) throw new Error("target-not-found");
  const target = {
    id: String(targetRow.id ?? targetRow.ID),
    handle: String(targetRow.handle),
    displayName: String(targetRow.displayName ?? targetRow.displayname),
    walletAddress: String(targetRow.walletAddress ?? targetRow.walletaddress),
  };

  // Always start clean so the endpoint is safely re-runnable.
  await clearDemo();

  const images = await uploadImages();
  const now = Date.now();

  // ---- cast accounts ----
  const cast: User[] = [];
  for (const [i, member] of CAST.entries()) {
    const authId = `${CAST_AUTH_PREFIX}${member.slug}`;
    const wallet = deriveWallet(authId);
    const user: User = {
      id: `usr_democast_${member.slug}`,
      authId,
      privyId: null,
      displayName: member.name,
      handle: member.handle,
      avatarUrl: images.posts[(i + 2) % images.posts.length]!,
      walletAddress: wallet.address,
      isCreator: member.isCreator,
      createdAt: now - rand(30, 120) * DAY,
    };
    await db.execute(
      `INSERT INTO users (id, authId, privyId, displayName, handle, avatarUrl, walletAddress, isCreator, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.id, user.authId, null, user.displayName, user.handle, user.avatarUrl, user.walletAddress, user.isCreator, user.createdAt]
    );
    cast.push(user);
  }

  // Target becomes a creator and gets an avatar if it has none.
  await db.execute("UPDATE users SET isCreator = $1 WHERE id = $2", [true, target.id]);
  await db.execute("UPDATE users SET avatarUrl = COALESCE(avatarUrl, $1) WHERE id = $2", [images.posts[0]!, target.id]);

  const creators = cast.filter((c) => CAST.find((m) => m.handle === c.handle)?.isCreator);
  const scouts = cast;

  // ---- follows (target gets followers; also follows some back) ----
  let followers = 0;
  await db.transaction(async (tx) => {
    for (const c of cast) {
      await tx.execute("INSERT INTO follows (followerId, followingId, createdAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [c.id, target.id, now - rand(1, 90) * DAY]);
      followers++;
    }
    for (const c of sample(cast, 7)) {
      await tx.execute("INSERT INTO follows (followerId, followingId, createdAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [target.id, c.id, now - rand(1, 60) * DAY]);
    }
    // cast follow each other for believable graphs
    for (const a of cast) for (const b of sample(cast.filter((x) => x.id !== a.id), 4)) {
      await tx.execute("INSERT INTO follows (followerId, followingId, createdAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [a.id, b.id, now - rand(1, 80) * DAY]);
    }
  });

  // ---- live streams (2 by target, 3 by cast creators) ----
  const streamOwners = [target.id, target.id, creators[0]!.id, creators[1]!.id, creators[2]!.id];
  const streamIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = `demo_stream_${i + 1}`;
    streamIds.push(id);
    await db.execute(
      `INSERT INTO streams (id, creatorId, title, videoUrl, durationSec, thumbnailUrl, startedAt, isLive, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, streamOwners[i]!, STREAM_TITLES[i]!, SAMPLE_VIDEO, rand(600, 1400), images.streams[i]!, now - rand(3, 50) * 60_000, true, now - rand(3, 50) * 60_000]
    );
  }

  // ---- reactions per stream (counts only; varied types/platforms/time) ----
  let reactions = 0;
  await db.transaction(async (tx) => {
    for (const streamId of streamIds) {
      const count = rand(60, 110);
      for (let i = 0; i < count; i++) {
        const u = pick(cast);
        const serverTimeMs = now - rand(0, 40) * 60_000;
        await tx.execute(
          `INSERT INTO reactions (id, eventId, userId, walletAddress, streamId, streamTimeMs, serverTimeMs, type, platform, watchTimeMs, batchId)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [newId("demo_rx"), `demo_${newEventId()}`, u.id, u.walletAddress, streamId, rand(5_000, 900_000), serverTimeMs, pick(REACTIONS), pick(PLATFORMS), rand(20_000, 300_000), null]
        );
        reactions++;
      }
    }
  });

  // ---- moments + earnings ----
  // Per-moment reward pools (USD). Dialled up so the demo reads as an established account.
  // Creator moments (target is the creator → creator earnings = 70% of each pool).
  const creatorUsdPlan = [3200, 2600, 2100, 1700, 1400, 1150, 920, 740, 560, 420, 280, 160];
  // Scout moments (target is founding curator #1 on other people's streams → scout earnings).
  const scoutUsdPlan = [2200, 1900, 1650, 1450, 1250, 1100, 980, 860, 740, 640, 540, 450, 370, 300, 240];

  let creatorTotal = 0n;
  let scoutTotal = 0n;
  const moments: SeededMoment[] = [];

  for (const usd of creatorUsdPlan) {
    const others = sample(scouts, rand(2, 4));
    const m = buildMoment({
      streamId: pick(streamIds.slice(0, 2)),
      creatorId: target.id,
      posterUrl: pick(images.streams),
      totalUsd: usd,
      curatorUsers: others,
      confirmedAt: now - rand(1, 20) * DAY - rand(0, DAY),
    });
    creatorTotal += m.moment.settlement!.creatorAmountUnits;
    moments.push(m);
  }

  for (const usd of scoutUsdPlan) {
    // Target is rank #1; mostly first-and-only or with a single co-curator, so its slice stays large.
    const otherScouts = Math.random() < 0.6 ? [] : sample(scouts, 1);
    const curatorUsers = [{ id: target.id, walletAddress: target.walletAddress } as User, ...otherScouts];
    const m = buildMoment({
      streamId: pick(streamIds.slice(2)),
      creatorId: pick(creators).id,
      posterUrl: pick(images.streams),
      totalUsd: usd,
      curatorUsers,
      confirmedAt: now - rand(1, 25) * DAY - rand(0, DAY),
    });
    scoutTotal += m.curators[0]!.rewardUnits;
    moments.push(m);
  }

  for (const { moment, curators, viewers } of moments) {
    await Moments.insert(moment, 0);
    await Moments.setCurators(moment.id, curators);
    await db.transaction(async (tx) => {
      for (const v of sample([...cast.map((c) => c.id), ...viewers], rand(8, 40))) {
        await tx.execute("INSERT INTO moment_views (momentId, viewerKey, viewedAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [moment.id, `user:${v}`, moment.confirmedAt ?? now]);
      }
    });
  }

  // ---- posts (one per image; authors across cast + target) ----
  const authors = [target.id, ...cast.map((c) => c.id)];
  let postCount = 0;
  const postIds: string[] = [];
  for (let i = 0; i < images.posts.length; i++) {
    const id = `demo_post_${i + 1}`;
    postIds.push(id);
    // Give the target 4 of the posts so its profile grid is populated.
    const authorId = i < 4 ? target.id : pick(authors);
    const createdAt = now - rand(0, 8) * DAY - rand(0, DAY);
    await db.execute(
      `INSERT INTO posts (id, authorId, body, mediaJson, linkUrl, streamId, momentId, communityId, replyToId, quotePostId, repostOfId, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, authorId, POST_BODIES[i % POST_BODIES.length]!, JSON.stringify([images.posts[i]!]), null, null, null, null, null, null, null, createdAt]
    );
    postCount++;
  }
  // likes + views + a couple of replies
  await db.transaction(async (tx) => {
    for (const id of postIds) {
      for (const liker of sample(cast, rand(4, cast.length))) {
        await tx.execute("INSERT INTO post_likes (postId, userId, createdAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, liker.id, now - rand(0, 6) * DAY]);
      }
      for (const viewer of sample(cast, rand(5, cast.length))) {
        await tx.execute("INSERT INTO post_views (postId, viewerKey, viewedAt) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, `user:${viewer.id}`, now - rand(0, 6) * DAY]);
      }
    }
    // a few replies to the target's first post for replyCount
    for (let r = 0; r < 3; r++) {
      await tx.execute(
        `INSERT INTO posts (id, authorId, body, mediaJson, linkUrl, streamId, momentId, communityId, replyToId, quotePostId, repostOfId, createdAt)
         VALUES ($1,$2,$3,'[]',NULL,NULL,NULL,NULL,$4,NULL,NULL,$5)`,
        [`demo_post_reply_${r + 1}`, pick(cast).id, pick(["this is so good", "need the setup list 🙏", "saving this fr"]), postIds[0]!, now - rand(0, 2) * DAY]
      );
    }
  });

  return {
    target: { id: target.id, handle: target.handle, displayName: target.displayName },
    cast: cast.length,
    streams: streamIds.length,
    posts: postCount,
    moments: moments.length,
    reactions,
    followers,
    creatorEarningsUsd: formatUsd(creatorTotal, env.UNITS_PER_USD),
    scoutEarningsUsd: formatUsd(scoutTotal, env.UNITS_PER_USD),
  };
}
