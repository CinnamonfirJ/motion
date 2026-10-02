import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
  // Upload in parallel (overwrite — idempotent, no HeadObject round-trip) to keep the whole
  // seed well under the request timeout.
  const spec = [
    ...Array.from({ length: 16 }, (_, i) => ({ kind: "posts", n: String(i + 1).padStart(2, "0") })),
    ...Array.from({ length: 5 }, (_, i) => ({ kind: "streams", n: String(i + 1).padStart(2, "0") })),
  ];
  await Promise.all(
    spec.map(({ kind, n }) =>
      s3.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: `demo/${kind}/${kind === "posts" ? "post" : "stream"}-${n}.jpg`,
        Body: readFileSync(resolve(ASSETS, `${kind}/${kind === "posts" ? "post" : "stream"}-${n}.jpg`)),
        ContentType: "image/jpeg",
      }))
    )
  );
  return {
    posts: Array.from({ length: 16 }, (_, i) => mediaUrl(`demo/posts/post-${String(i + 1).padStart(2, "0")}.jpg`)),
    streams: Array.from({ length: 5 }, (_, i) => mediaUrl(`demo/streams/stream-${String(i + 1).padStart(2, "0")}.jpg`)),
  };
}

type Cell = string | number | boolean | null;

/** One INSERT per chunk of rows (chunked so param count stays safe for sqlite too). */
async function bulkInsert(table: string, columns: string[], rows: Cell[][]): Promise<void> {
  if (!rows.length) return;
  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(900 / perRow));
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: Cell[] = [];
    const tuples = chunk.map((row, r) => {
      params.push(...row);
      return `(${columns.map((_, c) => `$${r * perRow + c + 1}`).join(",")})`;
    });
    await db.execute(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`, params);
  }
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

/** Serialize a settlement the same way store.ts does (bigint units → strings). */
function serializeSettlement(s: Settlement): string {
  return JSON.stringify({
    ...s,
    creatorAmountUnits: s.creatorAmountUnits.toString(),
    curatorPoolUnits: s.curatorPoolUnits.toString(),
    totalUnits: s.totalUnits.toString(),
  });
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

let seedRunning = false;

export async function seedDemo(opts: { targetHandle: string; reset?: boolean }): Promise<SeedResult> {
  if (seedRunning) throw new Error("seed-already-running");
  seedRunning = true;
  try {
    return await runSeed(opts);
  } finally {
    seedRunning = false;
  }
}

async function runSeed(opts: { targetHandle: string; reset?: boolean }): Promise<SeedResult> {
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
  const cast: User[] = CAST.map((member, i) => {
    const authId = `${CAST_AUTH_PREFIX}${member.slug}`;
    return {
      id: `usr_democast_${member.slug}`,
      authId,
      privyId: null,
      displayName: member.name,
      handle: member.handle,
      avatarUrl: images.posts[(i + 2) % images.posts.length]!,
      walletAddress: deriveWallet(authId).address,
      isCreator: member.isCreator,
      createdAt: now - rand(30, 120) * DAY,
    };
  });
  await bulkInsert(
    "users",
    ["id", "authId", "privyId", "displayName", "handle", "avatarUrl", "walletAddress", "isCreator", "createdAt"],
    cast.map((u) => [u.id, u.authId, null, u.displayName, u.handle, u.avatarUrl!, u.walletAddress, u.isCreator, u.createdAt])
  );

  // Target becomes a creator and gets an avatar if it has none.
  await db.execute("UPDATE users SET isCreator = $1 WHERE id = $2", [true, target.id]);
  await db.execute("UPDATE users SET avatarUrl = COALESCE(avatarUrl, $1) WHERE id = $2", [images.posts[0]!, target.id]);

  const creators = cast.filter((c) => CAST.find((m) => m.handle === c.handle)?.isCreator);
  const scouts = cast;

  // ---- follows (target gets followers; also follows some back) ----
  const followSeen = new Set<string>();
  const followRows: Cell[][] = [];
  const addFollow = (a: string, b: string) => {
    if (a === b || followSeen.has(`${a}>${b}`)) return;
    followSeen.add(`${a}>${b}`);
    followRows.push([a, b, now - rand(1, 90) * DAY]);
  };
  for (const c of cast) addFollow(c.id, target.id);
  const followers = cast.length;
  for (const c of sample(cast, 7)) addFollow(target.id, c.id);
  for (const a of cast) for (const b of sample(cast.filter((x) => x.id !== a.id), 4)) addFollow(a.id, b.id);
  await bulkInsert("follows", ["followerId", "followingId", "createdAt"], followRows);

  // ---- live streams (2 by target, 3 by cast creators) ----
  const streamOwners = [target.id, target.id, creators[0]!.id, creators[1]!.id, creators[2]!.id];
  const streamIds = Array.from({ length: 5 }, (_, i) => `demo_stream_${i + 1}`);
  await bulkInsert(
    "streams",
    ["id", "creatorId", "title", "videoUrl", "durationSec", "thumbnailUrl", "startedAt", "isLive", "createdAt"],
    streamIds.map((id, i) => [id, streamOwners[i]!, STREAM_TITLES[i]!, SAMPLE_VIDEO, rand(600, 1400), images.streams[i]!, now - rand(3, 50) * 60_000, true, now - rand(3, 50) * 60_000])
  );

  // ---- reactions per stream (counts only; varied types/platforms/time) ----
  const reactionRows: Cell[][] = [];
  for (const streamId of streamIds) {
    const count = rand(60, 110);
    for (let i = 0; i < count; i++) {
      const u = pick(cast);
      reactionRows.push([newId("demo_rx"), `demo_${newEventId()}`, u.id, u.walletAddress, streamId, rand(5_000, 900_000), now - rand(0, 40) * 60_000, pick(REACTIONS), pick(PLATFORMS), rand(20_000, 300_000), null]);
    }
  }
  await bulkInsert(
    "reactions",
    ["id", "eventId", "userId", "walletAddress", "streamId", "streamTimeMs", "serverTimeMs", "type", "platform", "watchTimeMs", "batchId"],
    reactionRows
  );
  const reactions = reactionRows.length;

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

  // Bulk-write moments, their founding curators, and views (few statements total).
  const momentRows: Cell[][] = [];
  const curatorRows: Cell[][] = [];
  const momentViewRows: Cell[][] = [];
  const castIds = cast.map((c) => c.id);
  for (const { moment, curators, viewers } of moments) {
    momentRows.push([
      moment.id, moment.streamId, moment.creatorId, moment.state, moment.spikeStreamTimeMs,
      moment.detectedAt, moment.confirmedAt, JSON.stringify(moment.clip), JSON.stringify(moment.metrics),
      serializeSettlement(moment.settlement!), 0, moment.createdAt, moment.updatedAt,
    ]);
    for (const c of curators) curatorRows.push([c.momentId, c.userId, c.walletAddress, c.rank, c.qualifyingStreamTimeMs, c.qualifyingServerTimeMs, c.rewardUnits.toString()]);
    const viewerIds = [...new Set([...castIds, ...viewers])];
    for (const v of sample(viewerIds, rand(8, viewerIds.length))) momentViewRows.push([moment.id, `user:${v}`, moment.confirmedAt ?? now]);
  }
  await bulkInsert("moments", ["id", "streamId", "creatorId", "state", "spikeStreamTimeMs", "detectedAt", "confirmedAt", "clip", "metrics", "settlement", "cooldownUntil", "createdAt", "updatedAt"], momentRows);
  await bulkInsert("founding_curators", ["momentId", "userId", "walletAddress", "rank", "qualifyingStreamTimeMs", "qualifyingServerTimeMs", "rewardUnits"], curatorRows);
  await bulkInsert("moment_views", ["momentId", "viewerKey", "viewedAt"], momentViewRows);

  // ---- posts (one per image; authors across cast + target) ----
  const authors = [target.id, ...castIds];
  const postIds = images.posts.map((_, i) => `demo_post_${i + 1}`);
  const postRows: Cell[][] = images.posts.map((url, i) => [
    postIds[i]!,
    // Give the target 4 of the posts so its profile grid is populated.
    i < 4 ? target.id : pick(authors),
    POST_BODIES[i % POST_BODIES.length]!, JSON.stringify([url]), null, null, null, null, null, null, null,
    now - rand(0, 8) * DAY - rand(0, DAY),
  ]);
  const postCols = ["id", "authorId", "body", "mediaJson", "linkUrl", "streamId", "momentId", "communityId", "replyToId", "quotePostId", "repostOfId", "createdAt"];
  await bulkInsert("posts", postCols, postRows);
  const postCount = postRows.length;
  // a few replies to the target's first post (separate insert so the parent id is visible)
  await bulkInsert("posts", postCols, Array.from({ length: 3 }, (_, r) => [
    `demo_post_reply_${r + 1}`, pick(cast).id, pick(["this is so good", "need the setup list 🙏", "saving this fr"]),
    "[]", null, null, null, null, postIds[0]!, null, null, now - rand(0, 2) * DAY,
  ]));

  // likes + views
  const likeRows: Cell[][] = [];
  const viewRows: Cell[][] = [];
  for (const id of postIds) {
    for (const liker of sample(cast, rand(4, cast.length))) likeRows.push([id, liker.id, now - rand(0, 6) * DAY]);
    for (const viewer of sample(cast, rand(5, cast.length))) viewRows.push([id, `user:${viewer.id}`, now - rand(0, 6) * DAY]);
  }
  await bulkInsert("post_likes", ["postId", "userId", "createdAt"], likeRows);
  await bulkInsert("post_views", ["postId", "viewerKey", "viewedAt"], viewRows);

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
