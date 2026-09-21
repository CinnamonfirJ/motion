// Passkey (WebAuthn) sign-in on the web. Biometric (Face ID / Windows Hello / fingerprint)
// unlocks a platform passkey; the credential maps to a Monad embedded wallet server-side.
import { type UserDTO } from "./api";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ---- base64url <-> ArrayBuffer ----
function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new PasskeyError((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json() as Promise<T>;
}

export class PasskeyError extends Error {}

export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Create a new passkey (biometric) and the Monad account behind it. */
export async function registerPasskey(displayName: string): Promise<{ token: string; user: UserDTO }> {
  const opts = await post<any>("/auth/passkey/register-options", { displayName });
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rp: opts.rp,
      user: {
        id: b64urlToBuf(opts.userHandle),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      pubKeyCredParams: opts.pubKeyCredParams,
      authenticatorSelection: opts.authenticatorSelection,
      attestation: opts.attestation,
      timeout: opts.timeout,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new PasskeyError("Passkey creation was cancelled");
  const response = cred.response as AuthenticatorAttestationResponse;
  return post("/auth/passkey/register", {
    credentialId: bufToB64url(cred.rawId),
    clientDataJSON: bufToB64url(response.clientDataJSON),
    displayName,
  });
}

/** Sign in with an existing passkey (discoverable — the browser shows the picker). */
export async function loginPasskey(): Promise<{ token: string; user: UserDTO }> {
  const opts = await post<any>("/auth/passkey/login-options", {});
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rpId: opts.rpId,
      userVerification: opts.userVerification,
      allowCredentials: [],
      timeout: opts.timeout,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new PasskeyError("Passkey sign-in was cancelled");
  const response = cred.response as AuthenticatorAssertionResponse;
  return post("/auth/passkey/login", {
    credentialId: bufToB64url(cred.rawId),
    clientDataJSON: bufToB64url(response.clientDataJSON),
  });
}
