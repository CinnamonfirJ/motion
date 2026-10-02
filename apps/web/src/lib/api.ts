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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Backoff for transient failures (Render cold start returns 502/503/504 for ~50s before it wakes).
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000];

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { ...opts, headers });
      if (res.ok) return res.json() as Promise<T>;
      // Retry gateway errors (service waking up); surface everything else immediately.
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < RETRY_BACKOFF_MS.length) {
        await sleep(RETRY_BACKOFF_MS[attempt]!);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as any).error || res.statusText);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Network error (fetch rejects) — retry with backoff, then give up.
      lastError = error;
      if (attempt < RETRY_BACKOFF_MS.length) { await sleep(RETRY_BACKOFF_MS[attempt]!); continue; }
      throw error;
    }
  }
  throw lastError;
}

function speakerPath(streamId: string, userId: string): string {
  if (typeof userId !== "string" || !userId.trim() || userId === "undefined" || userId === "null") {
    throw new Error("Speaker identity is missing. Refresh the room and try again.");
  }
  return `/streams/${streamId}/speakers/${encodeURIComponent(userId)}`;
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
  recording: boolean | null;
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

export interface LiveRoomDTO {
  isLive: boolean;
  hostConnected: boolean;
  hostDisconnectedAt: number | null;
  graceEndsAt: number | null;
  role: "host" | "speaker" | "viewer";
  mySpeaker: { userId: string; status: "requested" | "invited" | "approved"; canCamera: boolean; canScreenShare: boolean } | null;
  speakers: { userId: string; status: "requested" | "invited" | "approved"; canCamera: boolean; canScreenShare: boolean }[];
}

export interface ChatMessageDTO {
  id: string;
  streamId: string;
  body: string;
  createdAt: number;
  author: CreatorMini;
}

export interface BanDTO {
  userId: string;
  kind: "ban" | "timeout";
  expiresAt: number | null;
  createdAt: number;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}

export interface StreamAnalyticsDTO {
  currentViewers: number;
  peakViewers: number;
  uniqueViewers: number;
  totalWatchTimeMs: number;
  streamDurationMs: number;
  reactionCount: number;
  momentCount: number;
  followers: number;
  newFollowers: number;
  latestFollower: { displayName: string; handle: string; avatarUrl: string | null; at: number } | null;
}

export interface PostDTO {
  id: string;
  author: CreatorMini;
  body: string;
  media: string[];
  linkUrl: string | null;
  streamId: string | null;
  momentId: string | null;
  communityId: string | null;
  replyToId: string | null;
  quotePostId: string | null;
  repostOfId: string | null;
  createdAt: number;
  likes: number;
  replies: number;
  reposts: number;
  views: number;
  liked: boolean;
}
export interface FeedItemDTO {
  type: "post" | "stream" | "moment";
  createdAt: number;
  post?: PostDTO;
  stream?: StreamDTO;
  moment?: MomentDTO;
}
export interface CommunityDTO { id: string; slug: string; name: string; description: string; memberCount: number }

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
  updateProfile: (input: { displayName?: string; handle?: string; avatarUrl?: string | null }) =>
    req<{ user: UserDTO; privySynced: boolean }>("/me", { method: "PATCH", body: JSON.stringify(input) }),
  streams: () => req<{ streams: StreamDTO[] }>("/streams"),
  stream: (id: string, signal?: AbortSignal) =>
    req<{ stream: StreamDTO; sync: SyncDTO; activeMoments: MomentDTO[]; recentReactionCount: number }>(`/streams/${id}`, { signal }),
  sync: (id: string) => req<SyncDTO>(`/streams/${id}/sync`),
  livekitToken: (id: string, signal?: AbortSignal) =>
    req<{ url: string; token: string; room: string; role: "host" | "speaker" | "viewer" }>(`/streams/${id}/livekit-token`, {
      method: "POST",
      body: "{}",
      signal,
    }),
  liveRoom: (id: string) => req<LiveRoomDTO>(`/streams/${id}/live-room`),
  requestMic: (id: string) => req<{ ok: boolean; status: "requested" | "invited" | "approved" }>(`/streams/${id}/speaker-request`, { method: "POST", body: "{}" }),
  inviteSpeaker: (id: string, userId: string) => req<{ ok: boolean }>(`${speakerPath(id, userId)}/invite`, { method: "POST", body: "{}" }),
  acceptSpeakerInvite: (id: string) => req<{ ok: boolean }>(`/streams/${id}/speaker-invite/accept`, { method: "POST", body: "{}" }),
  approveSpeaker: (id: string, userId: string) => req<{ ok: boolean }>(`${speakerPath(id, userId)}/approve`, { method: "POST", body: "{}" }),
  setSpeakerPermissions: (id: string, userId: string, permissions: { canCamera?: boolean; canScreenShare?: boolean }) =>
    req<{ ok: boolean }>(speakerPath(id, userId), { method: "PATCH", body: JSON.stringify(permissions) }),
  removeSpeaker: (id: string, userId: string) => req<{ ok: boolean }>(speakerPath(id, userId), { method: "DELETE" }),
  chatHistory: (id: string, before?: number, signal?: AbortSignal) =>
    req<{ messages: ChatMessageDTO[] }>(`/streams/${id}/chat?${new URLSearchParams({ ...(before ? { before: String(before) } : {}) })}`, { signal }),
  sendChat: (id: string, body: string, clientId?: string) => req<{ ok: boolean; message: ChatMessageDTO }>(`/streams/${id}/chat`, { method: "POST", body: JSON.stringify({ body, clientId }) }),
  deleteChat: (id: string, messageId: string) => req<{ ok: boolean }>(`/streams/${id}/chat/${messageId}`, { method: "DELETE" }),
  bans: (id: string) => req<{ bans: BanDTO[] }>(`/streams/${id}/bans`),
  banUser: (id: string, userId: string, kind: "ban" | "timeout" = "ban", durationMs?: number) =>
    req<{ ok: boolean }>(`/streams/${id}/bans`, { method: "POST", body: JSON.stringify({ userId, kind, durationMs }) }),
  unban: (id: string, userId: string) => req<{ ok: boolean }>(`/streams/${id}/bans/${userId}`, { method: "DELETE" }),
  analytics: (id: string) => req<StreamAnalyticsDTO>(`/streams/${id}/analytics`),
  feed: (mode: "for-you" | "following", before?: number, communityId?: string) =>
    req<{ items: FeedItemDTO[]; nextBefore: number | null }>(`/feed?${new URLSearchParams({ mode, ...(before ? { before: String(before) } : {}), ...(communityId ? { communityId } : {}) })}`),
  post: (id: string) => req<{ post: PostDTO }>(`/posts/${id}`),
  replies: (id: string) => req<{ posts: PostDTO[] }>(`/posts/${id}/replies`),
  createPost: (input: { text?: string; uploadIds?: string[]; linkUrl?: string; streamId?: string; momentId?: string; communityId?: string; replyToId?: string; quotePostId?: string; repostOfId?: string }) =>
    req<{ post: PostDTO }>("/posts", { method: "POST", body: JSON.stringify(input) }),
  uploadPostMedia: (contentType: string, sizeBytes: number) =>
    req<{ uploadId: string; uploadUrl: string; publicUrl: string; contentType: string }>("/media/post-upload", { method: "POST", body: JSON.stringify({ contentType, sizeBytes }) }),
  // Server-side image upload (no R2 CORS needed): POST the raw bytes, server relays to R2.
  uploadImageDirect: async (file: File): Promise<{ uploadId: string; publicUrl: string; contentType: string }> => {
    const res = await fetch(`${API}/media/post-upload-direct`, {
      method: "POST",
      headers: { "Content-Type": file.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: file,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as any).error || res.statusText);
    }
    return res.json();
  },
  viewPost: (id: string) => req<{ ok: boolean }>(`/posts/${id}/view`, { method: "POST", body: "{}" }),
  likePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}/like`, { method: "PUT", body: "{}" }),
  unlikePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}/like`, { method: "DELETE" }),
  follow: (id: string) => req<{ ok: boolean }>(`/users/${id}/follow`, { method: "PUT", body: "{}" }),
  unfollow: (id: string) => req<{ ok: boolean }>(`/users/${id}/follow`, { method: "DELETE" }),
  userSocial: (id: string) => req<{ followers: number; following: number; posts: number; followedByMe: boolean }>(`/users/${id}/social`),
  publicUser: (id: string) => req<{ user: CreatorMini }>(`/users/${id}`),
  userPosts: (id: string) => req<{ posts: PostDTO[] }>(`/users/${id}/posts`),
  communities: () => req<{ communities: CommunityDTO[] }>("/communities"),
  community: (id: string) => req<{ community: CommunityDTO & { ownerId: string; member: boolean } }>(`/communities/${id}`),
  createCommunity: (name: string, description: string) => req<{ community: CommunityDTO }>("/communities", { method: "POST", body: JSON.stringify({ name, description }) }),
  joinCommunity: (id: string) => req<{ ok: boolean }>(`/communities/${id}/join`, { method: "PUT", body: "{}" }),
  leaveCommunity: (id: string) => req<{ ok: boolean }>(`/communities/${id}/join`, { method: "DELETE" }),
  react: (streamId: string, type: string, clientStreamTimeMs: number, eventId: string) =>
    sendReaction({ streamId, type, clientStreamTimeMs, eventId }),
  tip: (streamId: string, amountMon = "0.001") => req<{ transaction: UnsignedTransactionDTO; amountWei: string; amountUsd: string }>(`/streams/${streamId}/tip`, {
    method: "POST",
    body: JSON.stringify({ amountMon }),
  }),
  createStream: (title: string) => req<{ stream: StreamDTO }>("/streams", { method: "POST", body: JSON.stringify({ title }) }),
  endStream: (streamId: string) => req<{ ok: boolean; endedAt: number }>(`/streams/${streamId}/end`, { method: "POST", body: "{}" }),
  report: (targetType: "stream" | "moment" | "post" | "user", targetId: string, reason: string, details?: string) =>
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
