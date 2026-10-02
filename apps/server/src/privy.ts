import { PrivyClient, type User as PrivyUser } from "@privy-io/node";
import { env, privyConfigured } from "./env.js";

/**
 * Privy — the auth + embedded-wallet source of truth (when configured).
 *
 * The client authenticates with Privy (passkey-first) and sends us its Privy **access
 * token**. We verify that token server-side (signature + expiry) and resolve the user's
 * embedded Monad wallet, then mint our own short app session (see auth.issueToken) so every
 * existing `bearer()`-protected route keeps working unchanged.
 *
 * When Privy is not configured (`PRIVY_APP_ID` blank) this whole module stays dormant and the
 * app falls back to the built-in email + native-WebAuthn passkey path (routes `/auth/login`,
 * `/auth/passkey/*`).
 */

let client: PrivyClient | null = null;
function getClient(): PrivyClient {
  if (!client) {
    client = new PrivyClient({
      appId: env.PRIVY_APP_ID,
      appSecret: env.PRIVY_APP_SECRET,
      jwtVerificationKey: env.PRIVY_VERIFICATION_KEY || undefined,
    });
  }
  return client;
}

export interface PrivyIdentity {
  privyId: string;
  /** Embedded (or first linked) EVM wallet address, lowercased-checksum as Privy returns it. */
  walletAddress: string | null;
  displayName: string | null;
}

/** Pick the user's embedded EVM wallet (walletClientType 'privy'), else any ethereum wallet. */
function walletFromUser(user: PrivyUser): string | null {
  const wallets = user.linked_accounts.filter(
    (a: any) => a.type === "wallet" && a.chain_type === "ethereum"
  ) as any[];
  const embedded = wallets.find((w) => w.wallet_client_type === "privy" || w.wallet_client_type === "privy-v2");
  return (embedded ?? wallets[0])?.address ?? null;
}

function nameFromUser(user: PrivyUser): string | null {
  const email = user.linked_accounts.find((a: any) => a.type === "email") as any;
  if (email?.address) return String(email.address).split("@")[0] ?? null;
  return null;
}

/**
 * Verify a Privy access token and resolve the caller's identity + embedded wallet.
 * Throws on an invalid/expired token so the route can return 401.
 */
export async function verifyPrivyToken(accessToken: string): Promise<PrivyIdentity> {
  if (!privyConfigured()) throw new Error("privy-not-configured");
  const privy = getClient();
  // The current Node SDK verifies locally through the app's JWKS (or key override).
  const claims = await privy.utils().auth().verifyAccessToken(accessToken);
  // Wallet creation can finish on the client just before it is visible to the user API.
  let user = await privy.users()._get(claims.user_id);
  let walletAddress = walletFromUser(user);
  for (let attempt = 0; !walletAddress && attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    user = await privy.users()._get(claims.user_id);
    walletAddress = walletFromUser(user);
  }
  return {
    privyId: claims.user_id,
    walletAddress,
    displayName: nameFromUser(user),
  };
}

export async function deletePrivyUser(privyId: string): Promise<void> {
  if (!privyConfigured()) return;
  try {
    await getClient().users().delete(privyId);
  } catch (error) {
    // Retried deletion jobs are successful when Privy confirms the identity is already gone.
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return;
    throw error;
  }
}

/**
 * Mirror the app's editable profile fields into Privy custom metadata so Privy stays the
 * identity source of truth. Best-effort — the caller treats a throw as "DB updated, Privy not".
 */
export async function syncPrivyProfile(
  privyId: string,
  profile: { displayName: string; handle: string; avatarUrl: string | null }
): Promise<void> {
  if (!privyConfigured()) return;
  await getClient().users().setCustomMetadata(privyId, {
    custom_metadata: {
      display_name: profile.displayName,
      handle: profile.handle,
      avatar_url: profile.avatarUrl ?? "",
    },
  });
}
