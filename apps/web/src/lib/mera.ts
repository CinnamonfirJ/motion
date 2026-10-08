import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  toFunctionSelector,
  type Hex,
  type LocalAccount,
} from "viem";

/**
 * Mera — the whole account layer.
 *
 * One passkey ceremony returns 32 bytes of WebAuthn PRF output. Those bytes deterministically
 * seed a BIP-44 EVM account (Mera's documented recipe), so the same passkey on any device
 * reconstructs the same Monad address. Nothing secret is stored anywhere: the private key only
 * lives inside a Mera signing session, in memory, until the session ends.
 *
 * Session scope (what is prompt-free):
 * - tips to the MomentRewards contract (`tip(bytes32)`) on Monad,
 * - at most PER_TX_LIMIT each and SESSION_BUDGET in total,
 * - for SESSION_TTL_MS after the passkey prompt.
 * Anything else (another contract, a bigger amount, an exhausted budget) re-prompts for that
 * one transaction and does not widen the session. When the session expires the key is zeroed
 * and the next in-scope action re-prompts once to open a fresh session.
 */

export const SESSION_TTL_MS = 15 * 60_000;
export const PER_TX_LIMIT = parseEther("0.01");
export const SESSION_BUDGET = parseEther("0.05");
const TIP_SELECTOR = toFunctionSelector("tip(bytes32)");
const EVM_PATH = "m/44'/60'/0'/0/0";
/** Untrusted hint only: lets a returning browser target its own passkey. Clearing it is harmless. */
const HINT_KEY = "ennoia.passkey";

export const monad = defineChain({
  id: Number(import.meta.env.VITE_MONAD_CHAIN_ID || 10143),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});
const publicClient = createPublicClient({ chain: monad, transport: http(), pollingInterval: 500 }); // Monad blocks are sub-second

/** Passkeys are scoped to this host; every surface on the same domain derives the same account. */
const rpId = () => import.meta.env.VITE_PASSKEY_RP_ID || window.location.hostname;

export function isPasskeyPrfLikelySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && window.isSecureContext;
}

// ---------- untrusted credential hint ----------
type Hint = PasskeyCredentialMetadata & { address?: string };
function readHint(): Hint | undefined {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    const parsed = raw ? JSON.parse(raw) : undefined;
    return typeof parsed?.credentialId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
function writeHint(hint: Hint) {
  try { localStorage.setItem(HINT_KEY, JSON.stringify(hint)); } catch { /* storage is optional */ }
}
export function forgetPasskeyHint() {
  try { localStorage.removeItem(HINT_KEY); } catch { /* storage is optional */ }
}

// ---------- key derivation ----------
/** PRF output → BIP-39 entropy → BIP-44 Ethereum key → Mera signing session. Zeroes intermediates. */
function sessionFromPrf(prfOutput: Uint8Array): Secp256k1SigningSession {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const master = HDKey.fromMasterSeed(seed);
  const node = master.derive(EVM_PATH);
  try {
    if (!node.privateKey) throw new Error("mera-derivation-failed");
    // The session copies the key into its own snapshot, so wiping ours afterwards is safe.
    return createSecp256k1SigningSession({ privateKey: node.privateKey });
  } finally {
    node.wipePrivateData();
    master.wipePrivateData();
    seed.fill(0);
    prfOutput.fill(0);
  }
}

// ---------- live session ----------
interface Live {
  session: Secp256k1SigningSession;
  account: LocalAccount;
  address: string;
  expiresAt: number;
  spentWei: bigint;
  timer: ReturnType<typeof setTimeout>;
}
let live: Live | null = null;
let tipContract: string | null = import.meta.env.VITE_MOMENT_REWARDS_ADDRESS?.toLowerCase() || null;

export type SigningState =
  | { status: "locked" }
  | { status: "active"; address: string; expiresAt: number; remainingWei: bigint };

const listeners = new Set<(state: SigningState) => void>();
export function getSigningState(): SigningState {
  if (!live || live.expiresAt <= Date.now()) return { status: "locked" };
  return { status: "active", address: live.address, expiresAt: live.expiresAt, remainingWei: SESSION_BUDGET - live.spentWei };
}
export function subscribeSigning(fn: (state: SigningState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => { const state = getSigningState(); for (const fn of listeners) fn(state); };

/** The prompt-free tip target, from the backend's /config unless pinned at build time. */
export function setTipContract(address: string | null | undefined) {
  if (!import.meta.env.VITE_MOMENT_REWARDS_ADDRESS && address) tipContract = address.toLowerCase();
}

/** Ends the session: Mera zeroes the key and every later signing call throws. */
export function lock() {
  if (!live) return;
  clearTimeout(live.timer);
  live.session.end();
  live = null;
  emit();
}

function adopt(session: Secp256k1SigningSession): Live {
  lock();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  live = {
    session,
    account: toViemAccount(session),
    address: getEvmAddress(session.publicKey),
    expiresAt,
    spentWei: 0n,
    timer: setTimeout(lock, SESSION_TTL_MS),
  };
  emit();
  return live;
}

export class AccountMismatchError extends Error {
  constructor() {
    super("account-mismatch");
  }
}

const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** One prompt, no session: used for out-of-scope actions so they never widen the session. */
async function promptForSession(expectedAddress?: string): Promise<Secp256k1SigningSession> {
  const hint = readHint();
  const useHint = hint && (!expectedAddress || sameAddress(hint.address, expectedAddress));
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: useHint ? { credentialId: hint.credentialId, transports: hint.transports } : undefined,
  });
  const session = sessionFromPrf(prfOutput);
  const address = getEvmAddress(session.publicKey);
  if (expectedAddress && !sameAddress(address, expectedAddress)) {
    session.end();
    throw new AccountMismatchError();
  }
  writeHint({ credentialId, transports: useHint ? hint.transports : undefined, address });
  return session;
}

/** New user: one passkey ceremony creates the passkey and opens a signing session. */
export async function createAccount(displayName: string): Promise<string> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "ENNOIA" },
    user: { name: displayName, displayName },
  });
  const session = sessionFromPrf(created.prfOutput);
  const { address } = adopt(session);
  writeHint({ credentialId: created.credentialId, transports: created.transports, address });
  return address;
}

/** Returning user (any device): one passkey ceremony reconstructs the account and opens a session. */
export async function unlock(expectedAddress?: string): Promise<string> {
  return adopt(await promptForSession(expectedAddress)).address;
}

/** Prompt-free while a session is live (used to prove account ownership to the backend). */
export async function signMessage(message: string): Promise<Hex> {
  if (!live || live.expiresAt <= Date.now()) throw new Error("signing-session-locked");
  return live.account.signMessage({ message });
}

// ---------- transactions ----------
export interface TxRequest {
  to: string;
  data: string;
  value: string; // hex wei
  chainId: number;
}
export interface TxResult {
  hash: Hex;
  /** True when this transaction needed its own passkey prompt (outside the session scope). */
  prompted: boolean;
}

function inScope(tx: TxRequest, value: bigint): boolean {
  return (
    tx.chainId === monad.id &&
    !!tipContract && tx.to.toLowerCase() === tipContract &&
    tx.data.toLowerCase().startsWith(TIP_SELECTOR) && tx.data.length === 2 + 8 + 64 &&
    value <= PER_TX_LIMIT
  );
}

/** A brand-new account is funded by the backend at signup; give that transfer a moment to land. */
async function waitForFunds(address: Hex, needed: bigint) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    if ((await publicClient.getBalance({ address })) >= needed) return;
    if (Date.now() > deadline) throw new Error("insufficient-funds");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function submit(account: LocalAccount, tx: TxRequest, value: bigint): Promise<Hex> {
  if (tx.chainId !== monad.id) throw new Error("wrong-chain");
  await waitForFunds(account.address, value);
  const wallet = createWalletClient({ account, chain: monad, transport: http() });
  const hash = await wallet.sendTransaction({ to: tx.to as Hex, data: tx.data as Hex, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000, pollingInterval: 500 });
  if (receipt.status !== "success") throw new Error("transaction-reverted");
  return hash;
}

/**
 * Sends a transaction and waits for confirmation. In-scope actions sign prompt-free inside the
 * live session (re-opening it with one prompt after expiry); anything else asks for the passkey
 * for this one transaction and ends that key immediately afterwards.
 */
export async function sendTransaction(tx: TxRequest, expectedAddress: string): Promise<TxResult> {
  const value = BigInt(tx.value);

  if (!inScope(tx, value)) {
    const session = await promptForSession(expectedAddress);
    try {
      return { hash: await submit(toViemAccount(session), tx, value), prompted: true };
    } finally {
      session.end();
    }
  }

  let prompted = false;
  if (!live || live.expiresAt <= Date.now() || !sameAddress(live.address, expectedAddress)) {
    await unlock(expectedAddress);
    prompted = true;
  }
  const current = live!;
  if (current.spentWei + value > SESSION_BUDGET) {
    // Budget exhausted: approve this one explicitly rather than silently topping the session up.
    const session = await promptForSession(expectedAddress);
    try {
      return { hash: await submit(toViemAccount(session), tx, value), prompted: true };
    } finally {
      session.end();
    }
  }
  current.spentWei += value; // reserve before sending so concurrent taps can't overspend
  emit();
  try {
    return { hash: await submit(current.account, tx, value), prompted };
  } catch (error) {
    current.spentWei -= value;
    emit();
    throw error;
  }
}

export const formatMon = (wei: bigint) => `${Number(formatEther(wei)).toFixed(3)} MON`;

/** Human message for Mera/WebAuthn failures; null when the error isn't one of ours. */
export function describeMeraError(error: unknown): string | null {
  if (error instanceof AccountMismatchError) return "That passkey belongs to a different ENNOIA account. Pick the passkey you signed in with.";
  if (!isMeraError(error)) return null;
  switch (error.code) {
    case "PRF_UNAVAILABLE":
      return "This passkey provider can't create ENNOIA accounts. Use iCloud Keychain, Google Password Manager or Windows Hello in an up-to-date browser.";
    case "PASSKEY_OPERATION_FAILED":
      return null; // cancel / timeout / no passkey — callers already word these
    case "CRYPTO_UNAVAILABLE":
      return "This browser is missing secure crypto support. Open ENNOIA over https in a current browser.";
    default:
      return `Passkey error (${error.code}).`;
  }
}
