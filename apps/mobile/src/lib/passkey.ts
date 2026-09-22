// Passkey (WebAuthn) sign-in on mobile.
//
// Passkeys on React Native require a NATIVE module (react-native-passkeys) that only works in
// a custom Expo dev build with associated-domains configured — NOT in Expo Go. To keep the app
// running in Expo Go, this ships as a no-op stub: isPasskeySupported() is false, so the Sign-In
// screen falls back to the embedded-wallet email login.
//
// TO ENABLE real device passkeys (dev build):
//   1. pnpm --filter @ennoia/mobile add react-native-passkeys
//   2. Own a domain; set RP_ID/RP_ORIGINS (backend .env) and ios.associatedDomains in app.json,
//      and host /.well-known/apple-app-site-association + assetlinks.json.
//   3. Build a dev client (npx expo prebuild && eas build, or a local run) — Expo Go can't load it.
//   4. Replace the three functions below to call react-native-passkeys `isSupported`/`create`/`get`
//      (returns base64url), posting { credentialId, clientDataJSON } to the SAME backend routes
//      the web client uses (/auth/passkey/*). See apps/web/src/lib/passkey.ts for the shape.
import { type UserDTO } from "./api";

export async function isPasskeySupported(): Promise<boolean> {
  return false; // enable via a custom dev build (see header)
}

export async function registerPasskey(_displayName: string): Promise<{ token: string; user: UserDTO }> {
  throw new Error("Passkeys need a custom dev build on mobile — use email sign-in in Expo Go.");
}

export async function loginPasskey(): Promise<{ token: string; user: UserDTO }> {
  throw new Error("Passkeys need a custom dev build on mobile — use email sign-in in Expo Go.");
}
