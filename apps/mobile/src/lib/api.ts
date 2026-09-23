import * as SecureStore from "expo-secure-store";

// Same REST contract as web (apps/web/src/lib/api.ts). Business logic stays server-side.
const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:4000/ws";

let token: string | null = null;
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export async function loadToken() {
  token = await SecureStore.getItemAsync("ennoia_token");
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync("ennoia_token", t);
  else await SecureStore.deleteItemAsync("ennoia_token");
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
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({ error: res.statusText }))).error, res.status);
  return res.json() as Promise<T>;
}

export interface UserDTO {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  walletAddress: string;
  isCreator: boolean;
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
  creator: { id: string; displayName: string; handle: string; avatarUrl: string | null } | null;
}
export interface MomentDTO {
  id: string;
  streamId: string;
  state: string;
  statusLabel: string;
  isLiveStream: boolean;
  clip: { startStreamTimeMs: number; endStreamTimeMs: number; durationSec: number; url: string | null; ready: boolean };
  metrics: { totalReactions: number; uniqueReactors: number; mix: { fire: number; laugh: number; wow: number }; peakRate: number; peakOffsetSec: number; category: string; histogram: { second: number; fire: number; laugh: number; wow: number }[] };
  creator: { id: string; displayName: string; handle: string; avatarUrl: string | null } | null;
  streamTitle: string;
  foundingCurators: any[];
  foundingCuratorCount: number;
  settlement: any;
  confirmedAt: number | null;
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

export const api = {
  login: (email: string, provider = "email", displayName?: string) =>
    req<{ token: string; user: UserDTO }>("/auth/login", { method: "POST", body: JSON.stringify({ email, provider, displayName }) }),
  privy: (accessToken: string, displayName?: string) =>
    req<{ token: string; user: UserDTO }>("/auth/privy", { method: "POST", body: JSON.stringify({ accessToken, displayName }) }),
  me: () => req<{ user: UserDTO; wallet: { address: string; network: string; onchain: boolean } }>("/me"),
  streams: () => req<{ streams: StreamDTO[] }>("/streams"),
  stream: (id: string) => req<{ stream: StreamDTO; sync: SyncDTO; activeMoments: MomentDTO[] }>(`/streams/${id}`),
  react: (streamId: string, type: string, clientStreamTimeMs: number, eventId: string, platform: string) =>
    req<{ ok: boolean }>("/reactions", { method: "POST", body: JSON.stringify({ streamId, type, clientStreamTimeMs, platform, eventId }) }),
  tip: (streamId: string, amountMon = "0.001") =>
    req<{ transaction: UnsignedTransactionDTO; amountWei: string; amountUsd: string }>(`/streams/${streamId}/tip`, {
      method: "POST",
      body: JSON.stringify({ amountMon }),
    }),
  livekitToken: (streamId: string) => req<{ url: string; token: string; room: string; role: "host" | "viewer" }>(`/streams/${streamId}/livekit-token`, { method: "POST", body: "{}" }),
  createStream: (title: string) => req<{ stream: StreamDTO }>("/streams", { method: "POST", body: JSON.stringify({ title }) }),
  endStream: (streamId: string) => req<{ ok: boolean; endedAt: number }>(`/streams/${streamId}/end`, { method: "POST", body: "{}" }),
  report: (targetType: "stream" | "moment" | "user", targetId: string, reason: string, details?: string) =>
    req<{ reportId: string; status: string }>("/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  blockUser: (userId: string) => req<{ ok: boolean }>(`/users/${userId}/block`, { method: "POST", body: "{}" }),
  deleteAccount: () => req<{ ok: boolean; onchainDataRetained: boolean }>("/me", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE" }) }),
  clip: (streamId: string, clientStreamTimeMs: number) =>
    req<{ ok: boolean; clip: { url: string; durationSec: number } }>(`/streams/${streamId}/clip`, { method: "POST", body: JSON.stringify({ clientStreamTimeMs }) }),
  moments: () => req<{ moments: MomentDTO[] }>("/moments"),
  moment: (id: string) => req<{ moment: MomentDTO }>(`/moments/${id}`),
  scoutEarnings: () => req<{ totalUsd: string; momentsCurated: number; firstFinds: number; rewards: any[] }>("/earnings/scout"),
  creatorEarnings: () => req<{ totalUsd: string; momentsGenerated: number; payouts: any[] }>("/earnings/creator"),
  time: () => req<{ serverTime: number }>("/time"),
};
