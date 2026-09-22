// Typed REST client for the ENNOIA backend.
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

let token: string | null = localStorage.getItem("ennoia_token");
export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("ennoia_token", t);
  else localStorage.removeItem("ennoia_token");
}
export function getToken() {
  return token;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---- DTO shapes (mirror server view.ts) ----
export interface UserDTO {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  walletAddress: string;
  isCreator: boolean;
}
export interface CreatorMini {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}
export interface StreamDTO {
  id: string;
  title: string;
  videoUrl: string;
  durationSec: number;
  thumbnailUrl: string | null;
  startedAt: number;
  isLive: boolean;
  viewerCount: number;
  mode: "livekit" | "vod";
  livekitRoom: string | null;
  creator: CreatorMini | null;
}
export interface ClipDTO {
  startStreamTimeMs: number;
  endStreamTimeMs: number;
  durationSec: number;
  url: string | null;
  ready: boolean;
}
export interface CuratorDTO {
  userId: string;
  rank: number;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  rewardUsd: string;
  rewardUnits: string;
  qualifyingStreamTimeMs: number;
}
export interface SettlementDTO {
  status: "pending" | "submitted" | "confirmed" | "failed";
  txHash: string | null;
  explorerUrl: string | null;
  network: string;
  onchain: boolean;
  creatorAmountUsd: string;
  curatorPoolUsd: string;
  totalUsd: string;
  error: string | null;
}
export interface MomentDTO {
  id: string;
  streamId: string;
  state: string;
  statusLabel: string;
  isLiveStream: boolean;
  spikeStreamTimeMs: number;
  detectedAt: number;
  confirmedAt: number | null;
  clip: ClipDTO;
  metrics: {
    totalReactions: number;
    uniqueReactors: number;
    mix: { fire: number; laugh: number; wow: number };
    peakRate: number;
    peakOffsetSec: number;
    category: string;
    histogram: { second: number; fire: number; laugh: number; wow: number }[];
  };
  creator: CreatorMini | null;
  streamTitle: string;
  views: number;
  foundingCurators: CuratorDTO[];
  foundingCuratorCount: number;
  settlement: SettlementDTO | null;
  onchainMomentId: string;
  livekitRoom: string | null;
  createdAt: number;
}
export interface SyncDTO {
  serverTime: number;
  startedAt: number;
  durationSec: number;
  positionSec: number;
  streamTimeMs: number;
  recentWindowMs: number;
}

export interface UnsignedTransactionDTO {
  to: `0x${string}`;
  data: `0x${string}`;
  value: `0x${string}`;
  chainId: number;
}

interface PendingReaction {
  streamId: string;
  type: string;
  clientStreamTimeMs: number;
  eventId: string;
}

const reactionQueueKey = "ennoia_pending_reactions_v1";
const reactionQueue = (): PendingReaction[] => {
  try { return JSON.parse(localStorage.getItem(reactionQueueKey) || "[]") as PendingReaction[]; } catch { return []; }
};
const saveReactionQueue = (queue: PendingReaction[]) => {
  if (queue.length) localStorage.setItem(reactionQueueKey, JSON.stringify(queue.slice(-500)));
  else localStorage.removeItem(reactionQueueKey);
};
const postReaction = (reaction: PendingReaction) => req<{ ok: boolean; duplicate: boolean }>("/reactions", {
  method: "POST",
  body: JSON.stringify({ ...reaction, platform: "web" }),
});
async function sendReaction(reaction: PendingReaction): Promise<{ ok: boolean; duplicate: boolean; queued?: boolean }> {
  try {
    return await postReaction(reaction);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500 && error.status !== 401 && error.status !== 403) throw error;
    const queue = reactionQueue();
    if (!queue.some((item) => item.eventId === reaction.eventId)) queue.push(reaction);
    saveReactionQueue(queue);
    return { ok: true, duplicate: false, queued: true };
  }
}
export async function flushReactionQueue() {
  const remaining: PendingReaction[] = [];
  for (const reaction of reactionQueue()) {
    try { await postReaction(reaction); }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) continue;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) continue;
      remaining.push(reaction);
    }
  }
  saveReactionQueue(remaining);
}
window.addEventListener("online", () => { void flushReactionQueue(); });
if (navigator.onLine) void flushReactionQueue();

export const api = {
  wsUrl: import.meta.env.VITE_WS_URL || "ws://localhost:4000/ws",
  login: (email: string, provider = "email", displayName?: string) =>
    req<{ token: string; user: UserDTO }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, provider, displayName }),
    }),
  privy: (accessToken: string, displayName?: string) =>
    req<{ token: string; user: UserDTO }>("/auth/privy", {
      method: "POST",
      body: JSON.stringify({ accessToken, displayName }),
    }),
  me: () => req<{ user: UserDTO; wallet: { address: string; network: string; onchain: boolean } }>("/me"),
  streams: () => req<{ streams: StreamDTO[] }>("/streams"),
  stream: (id: string) =>
    req<{ stream: StreamDTO; sync: SyncDTO; activeMoments: MomentDTO[]; recentReactionCount: number }>(`/streams/${id}`),
  sync: (id: string) => req<SyncDTO>(`/streams/${id}/sync`),
  livekitToken: (id: string) =>
    req<{ url: string; token: string; room: string; role: "host" | "viewer" }>(`/streams/${id}/livekit-token`, {
      method: "POST",
      body: "{}",
    }),
  react: (streamId: string, type: string, clientStreamTimeMs: number, eventId: string) =>
    sendReaction({ streamId, type, clientStreamTimeMs, eventId }),
  tip: (streamId: string, amountMon = "0.001") => req<{ transaction: UnsignedTransactionDTO; amountWei: string; amountUsd: string }>(`/streams/${streamId}/tip`, {
    method: "POST",
    body: JSON.stringify({ amountMon }),
  }),
  createStream: (title: string) => req<{ stream: StreamDTO }>("/streams", { method: "POST", body: JSON.stringify({ title }) }),
  endStream: (streamId: string) => req<{ ok: boolean; endedAt: number }>(`/streams/${streamId}/end`, { method: "POST", body: "{}" }),
  report: (targetType: "stream" | "moment" | "user", targetId: string, reason: string, details?: string) =>
    req<{ reportId: string; status: string }>("/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  blockUser: (userId: string) => req<{ ok: boolean }>(`/users/${userId}/block`, { method: "POST", body: "{}" }),
  deleteAccount: () => req<{ ok: boolean; onchainDataRetained: boolean }>("/me", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE" }) }),
  clip: (streamId: string, clientStreamTimeMs: number) =>
    req<{ ok: boolean; clip: { url: string; durationSec: number } }>(`/streams/${streamId}/clip`, {
      method: "POST",
      body: JSON.stringify({ clientStreamTimeMs }),
    }),
  demo: {
    crowd: () => req<{ crowd: { id: string; displayName: string }[]; label: string }>("/demo/crowd"),
    forceSpike: (streamId: string) => req<{ ok: boolean; reactionsSent: number }>("/demo/force-spike", { method: "POST", body: JSON.stringify({ streamId }) }),
    fastForward: (streamId: string) => req<{ ok: boolean; settled: number }>("/demo/fast-forward", { method: "POST", body: JSON.stringify({ streamId }) }),
    reset: (streamId: string) => req<{ ok: boolean }>("/demo/reset", { method: "POST", body: JSON.stringify({ streamId }) }),
  },
  moments: () => req<{ moments: MomentDTO[] }>("/moments"),
  moment: (id: string) => req<{ moment: MomentDTO }>(`/moments/${id}`),
  scoutEarnings: () =>
    req<{
      totalUsd: string;
      momentsCurated: number;
      firstFinds: number;
      rewards: any[];
    }>("/earnings/scout"),
  creatorEarnings: () =>
    req<{ totalUsd: string; momentsGenerated: number; payouts: any[] }>("/earnings/creator"),
};
