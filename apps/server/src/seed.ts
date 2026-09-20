import { deriveWallet, normalizeAuthId } from "./auth.js";
import { Users, Streams } from "./store.js";
import { ingestReaction } from "./momentEngine.js";
import { newEventId, type ReactionType, type Platform, type User } from "@moment/core";

/**
 * Demo data + participant simulation (PRD §40). Kept fully isolated from product logic:
 * seeded bots react through the SAME ingestReaction path as real users, so spikes and
 * Moments form organically — nothing about detection or settlement is faked here.
 */

const SAMPLE = "https://storage.googleapis.com/gtv-videos-bucket/sample";

interface SeedStream {
  authId: string;
  name: string;
  handle: string;
  title: string;
  video: string;
  durationSec: number;
  thumb: string;
}

const STREAMS: SeedStream[] = [
  {
    authId: "seed:creator:pixel",
    name: "Pixel Riot",
    handle: "pixelriot",
    title: "Ranked grind — road to the top",
    video: `${SAMPLE}/BigBuckBunny.mp4`,
    durationSec: 596,
    thumb: `${SAMPLE}/images/BigBuckBunny.jpg`,
  },
  {
    authId: "seed:creator:mara",
    name: "Mara Live",
    handle: "maralive",
    title: "Late night music + hangout",
    video: `${SAMPLE}/ElephantsDream.mp4`,
    durationSec: 653,
    thumb: `${SAMPLE}/images/ElephantsDream.jpg`,
  },
  {
    authId: "seed:creator:koda",
    name: "Koda Makes",
    handle: "kodamakes",
    title: "Building something weird on stream",
    video: `${SAMPLE}/Sintel.mp4`,
    durationSec: 888,
    thumb: `${SAMPLE}/images/Sintel.jpg`,
  },
];

const BOT_COUNT = 14;
const REACTION_TYPES: ReactionType[] = ["fire", "laugh", "wow"];

let bots: User[] = [];
let liveStreamIds: string[] = [];

export function seedIfEmpty(): void {
  if (Streams.all().length > 0) {
    liveStreamIds = Streams.live().map((s) => s.id);
    bots = loadBots();
    return;
  }
  const now = Date.now();
  STREAMS.forEach((s, i) => {
    const wallet = deriveWallet(s.authId);
    const creator = Users.create({
      authId: s.authId,
      displayName: s.name,
      handle: s.handle,
      avatarUrl: null,
      walletAddress: wallet.address,
      isCreator: true,
    });
    const streamId = `stream_${s.handle}`;
    Streams.upsert({
      id: streamId,
      creatorId: creator.id,
      title: s.title,
      videoUrl: s.video,
      durationSec: s.durationSec,
      thumbnailUrl: s.thumb,
      // Stagger start times so streams sit at different positions.
      startedAt: now - (30_000 + i * 15_000),
      isLive: true,
      createdAt: now,
    });
    liveStreamIds.push(streamId);
  });

  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    const authId = normalizeAuthId("seed", `bot${i}@moment.demo`);
    const wallet = deriveWallet(authId);
    bots.push(
      Users.create({
        authId,
        displayName: BOT_NAMES[i % BOT_NAMES.length]!,
        handle: `${BOT_NAMES[i % BOT_NAMES.length]!.toLowerCase()}${i}`,
        avatarUrl: null,
        walletAddress: wallet.address,
        isCreator: false,
      })
    );
  }
  console.log(`[seed] created ${STREAMS.length} streams and ${bots.length} demo scouts`);
}

function loadBots(): User[] {
  const out: User[] = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    const u = Users.byAuthId(normalizeAuthId("seed", `bot${i}@moment.demo`));
    if (u) out.push(u);
  }
  return out;
}

const BOT_NAMES = ["Nova", "Rune", "Sable", "Juno", "Ash", "Wren", "Cove", "Iris", "Bex", "Milo", "Zara", "Fen", "Odie", "Vale"];

// ---------- participant simulation ----------
interface StreamSpikeState {
  nextSpikeAt: number;
  spikeUntil: number;
}
const spikeState = new Map<string, StreamSpikeState>();

function react(bot: User, streamId: string, platform: Platform) {
  ingestReaction(bot, {
    streamId,
    type: REACTION_TYPES[Math.floor(Math.random() * REACTION_TYPES.length)]!,
    clientStreamTimeMs: 0, // server reconciles to authoritative time
    platform,
    eventId: newEventId(),
  });
}

const PLATFORMS: Platform[] = ["web", "ios", "android"];

/** One driver tick (~500ms). Background chatter + periodic scripted spikes for the demo. */
export function driveBots(now: number): void {
  if (bots.length === 0) return;
  for (const streamId of liveStreamIds) {
    let st = spikeState.get(streamId);
    if (!st) {
      st = { nextSpikeAt: now + 20_000 + Math.random() * 20_000, spikeUntil: 0 };
      spikeState.set(streamId, st);
    }

    // Background chatter: a couple of reactions from random bots.
    if (Math.random() < 0.5) {
      const bot = bots[Math.floor(Math.random() * bots.length)]!;
      react(bot, streamId, PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)]!);
    }

    // Kick off a scripted spike from a mix of platforms.
    if (now >= st.nextSpikeAt && st.spikeUntil === 0) {
      st.spikeUntil = now + 5_000;
      st.nextSpikeAt = now + 70_000 + Math.random() * 40_000; // next spike well after cooldown
    }
    if (st.spikeUntil > 0 && now <= st.spikeUntil) {
      // Dense burst: several unique bots react each tick to clear unique + multiplier gates.
      const count = 6;
      for (let i = 0; i < count; i++) {
        const bot = bots[(Math.floor(now / 100) + i) % bots.length]!;
        react(bot, streamId, PLATFORMS[i % PLATFORMS.length]!);
      }
    } else if (st.spikeUntil > 0 && now > st.spikeUntil) {
      st.spikeUntil = 0;
    }
  }
}
