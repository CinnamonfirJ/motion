/**
 * Reaction-batch commitment (PRD §20, §21). We do not write one tx per reaction; instead
 * we commit a Merkle-style root over a batch of reaction leaves, proving the reactions
 * existed within a time range and contributed to a Moment — without bloating the chain.
 *
 * The hash function is injected so @moment/core stays dependency-free; the backend passes
 * keccak256 (ethers) to stay consistent with the Solidity side.
 */

export interface ReactionLeaf {
  eventId: string;
  userId: string;
  streamId: string;
  streamTimeMs: number;
  serverTimeMs: number;
  type: string;
}

export type HashHex = string; // 0x-prefixed hex

export interface HashFns {
  /** Hash a canonical leaf string to a 0x hex digest. */
  hashLeaf: (canonical: string) => HashHex;
  /** Hash two ordered child hashes to a parent hash. */
  hashPair: (a: HashHex, b: HashHex) => HashHex;
}

/** Canonical, stable serialization of a leaf (order-fixed — never JSON.stringify a map). */
export function canonicalizeLeaf(leaf: ReactionLeaf): string {
  return [
    leaf.eventId,
    leaf.userId,
    leaf.streamId,
    String(leaf.streamTimeMs),
    String(leaf.serverTimeMs),
    leaf.type,
  ].join("|");
}

/**
 * Compute a Merkle root over leaves. Leaves are first sorted by their hash for a
 * deterministic, order-independent commitment. Odd nodes are promoted (duplicated).
 * Empty batch => 0x000...0.
 */
export function computeCommitment(leaves: ReactionLeaf[], fns: HashFns): HashHex {
  if (leaves.length === 0) return "0x" + "0".repeat(64);
  let level = leaves.map((l) => fns.hashLeaf(canonicalizeLeaf(l)));
  level.sort();
  while (level.length > 1) {
    const next: HashHex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = level[i + 1] ?? a; // promote odd node
      next.push(fns.hashPair(a, b));
    }
    level = next;
  }
  return level[0]!;
}
