import { env, envioConfigured } from "./env.js";

/**
 * Envio — read-only analytics over Monad. The Envio HyperIndex (packages/indexer) indexes the
 * MomentRewards events and exposes a GraphQL API; this thin client queries it for feeds,
 * leaderboards and reward history.
 *
 * Envio is NOT the application database — offchain data (identity, streams, reactions, Moment
 * lifecycle) stays in SQLite. When `ENVIO_GRAPHQL_URL` is blank every function returns null and
 * callers fall back to local aggregates, so the app runs with or without a running indexer.
 */

export function envioEnabled(): boolean {
  return envioConfigured();
}

async function query<T>(gql: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  if (!envioConfigured()) return null;
  try {
    const res = await fetch(env.ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: gql, variables }),
    });
    if (!res.ok) throw new Error(`envio ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: unknown };
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data ?? null;
  } catch (e) {
    console.error("[envio] query failed — falling back to local", e);
    return null;
  }
}

// ---- entity shapes (mirror packages/indexer/schema.graphql) ----
export interface CuratorStatsRow {
  id: string; // wallet address
  totalRewards: string; // wei/units as string
  firstFinds: number;
  momentsCurated: number;
}
export interface CreatorStatsRow {
  id: string;
  totalRewards: string;
  momentsGenerated: number;
  totalTips: string;
}
export interface MomentRow {
  id: string;
  streamId: string;
  creator: string;
  category: number;
  curatorCount: number;
  settled: boolean;
  totalPaid: string;
  createdAtBlock: number;
}

/** Top curators by on-chain rewards (leaderboard). */
export function topCurators(limit = 20): Promise<{ CuratorStats: CuratorStatsRow[] } | null> {
  return query(
    `query Top($limit: Int!) {
       CuratorStats(order_by: { totalRewards: desc }, limit: $limit) {
         id totalRewards firstFinds momentsCurated
       }
     }`,
    { limit }
  );
}

/** Recently created/settled Moments, newest first (trending onchain activity feed). */
export function trendingMoments(limit = 30): Promise<{ Moment: MomentRow[] } | null> {
  return query(
    `query Trending($limit: Int!) {
       Moment(order_by: { createdAtBlock: desc }, limit: $limit) {
         id streamId creator category curatorCount settled totalPaid createdAtBlock
       }
     }`,
    { limit }
  );
}

/** On-chain reward history for one wallet (creator + curator payouts). */
export function rewardHistory(wallet: string): Promise<{ CuratorStats: CuratorStatsRow[]; CreatorStats: CreatorStatsRow[] } | null> {
  return query(
    `query History($wallet: String!) {
       CuratorStats(where: { id: { _eq: $wallet } }) { id totalRewards firstFinds momentsCurated }
       CreatorStats(where: { id: { _eq: $wallet } }) { id totalRewards momentsGenerated totalTips }
     }`,
    { wallet: wallet.toLowerCase() }
  );
}
