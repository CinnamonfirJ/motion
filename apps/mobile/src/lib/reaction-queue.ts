import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { ApiError, api } from "./api";

const storageKey = "ennoia_pending_reactions_v1";
let flushing: Promise<void> | null = null;

interface PendingReaction {
  streamId: string;
  type: string;
  clientStreamTimeMs: number;
  eventId: string;
  platform: string;
}

async function readQueue(): Promise<PendingReaction[]> {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return [];
  try { return JSON.parse(stored) as PendingReaction[]; } catch { return []; }
}

async function writeQueue(queue: PendingReaction[]): Promise<void> {
  if (queue.length) await AsyncStorage.setItem(storageKey, JSON.stringify(queue.slice(-500)));
  else await AsyncStorage.removeItem(storageKey);
}

async function enqueue(reaction: PendingReaction): Promise<void> {
  const queue = await readQueue();
  if (!queue.some((item) => item.eventId === reaction.eventId)) queue.push(reaction);
  await writeQueue(queue);
}

export async function flushReactionQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = await readQueue();
    const remaining: PendingReaction[] = [];
    for (const reaction of queue) {
      try {
        await api.react(reaction.streamId, reaction.type, reaction.clientStreamTimeMs, reaction.eventId, reaction.platform);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) continue;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) continue;
        remaining.push(reaction);
      }
    }
    await writeQueue(remaining);
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function sendReaction(reaction: PendingReaction): Promise<"sent" | "queued"> {
  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    await enqueue(reaction);
    return "queued";
  }
  try {
    await api.react(reaction.streamId, reaction.type, reaction.clientStreamTimeMs, reaction.eventId, reaction.platform);
    return "sent";
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500 || error.status === 401 || error.status === 403) {
      await enqueue(reaction);
      return "queued";
    }
    throw error;
  }
}

export function initializeReactionQueue(): () => void {
  void flushReactionQueue();
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void flushReactionQueue();
  });
}
