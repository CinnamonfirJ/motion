import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env, chainConfigured } from "./env.js";
import type { HashFns } from "@moment/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** keccak-based hash fns for reaction-batch Merkle commitments (matches Solidity). */
export const hashFns: HashFns = {
  hashLeaf: (canonical: string) => ethers.keccak256(ethers.toUtf8Bytes(canonical)),
  hashPair: (a: string, b: string) =>
    ethers.keccak256(ethers.concat([a as `0x${string}`, b as `0x${string}`])),
};

export const momentIdHash = (momentId: string): string =>
  ethers.keccak256(ethers.toUtf8Bytes(momentId));
export const toBytes32 = (s: string): string => ethers.keccak256(ethers.toUtf8Bytes(s));

const MINIMAL_ABI = [
  "function commitReactionBatch(bytes32 batchId, bytes32 streamId, uint256 reactionCount, uint64 fromTs, uint64 toTs, bytes32 commitment)",
  "function settleMoment(bytes32 momentId, address creator, uint256 creatorAmount, address[] curators, uint256[] curatorAmounts)",
  "function isMomentSettled(bytes32 momentId) view returns (bool)",
  "function poolBalance() view returns (uint256)",
  "function batchCommitted(bytes32) view returns (bool)",
];

export interface ChainClient {
  enabled: boolean;
  contract: ethers.Contract | null;
  provider: ethers.JsonRpcProvider | null;
  explorerTx: (hash: string) => string;
}

let cached: ChainClient | null = null;

/** Try the deployments file for an address if env didn't provide one. */
function resolveAddress(): string {
  if (env.MOMENT_REWARDS_ADDRESS) return env.MOMENT_REWARDS_ADDRESS;
  try {
    const p = resolve(__dirname, "../../../packages/contracts/deployments/monadTestnet.json");
    const j = JSON.parse(readFileSync(p, "utf8"));
    return j.address ?? "";
  } catch {
    return "";
  }
}

export function getChain(): ChainClient {
  if (cached) return cached;
  const address = resolveAddress();
  const ready = chainConfigured() || (Boolean(env.MONAD_RPC_URL) && Boolean(env.SETTLER_PRIVATE_KEY) && Boolean(address));

  if (!ready) {
    cached = {
      enabled: false,
      contract: null,
      provider: null,
      explorerTx: (h) => `${env.MONAD_EXPLORER_TX}${h}`,
    };
    return cached;
  }

  const provider = new ethers.JsonRpcProvider(env.MONAD_RPC_URL);
  const signer = new ethers.Wallet(env.SETTLER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(address, MINIMAL_ABI, signer);
  cached = {
    enabled: true,
    contract,
    provider,
    explorerTx: (h) => `${env.MONAD_EXPLORER_TX}${h}`,
  };
  return cached;
}
