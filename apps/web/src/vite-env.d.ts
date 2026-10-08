/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_AUTH_MODE?: "mera" | "fallback";
  readonly VITE_PASSKEY_RP_ID?: string;
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_MONAD_CHAIN_ID?: string;
  readonly VITE_MOMENT_REWARDS_ADDRESS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
