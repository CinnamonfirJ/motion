import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { App } from "./App";
import { initTheme } from "./lib/theme";
import "./index.css";
import { defineChain } from "viem";

initTheme(); // apply saved theme (default light) before first paint

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});
const app = privyAppId ? (
  <PrivyProvider
    appId={privyAppId}
    clientId={import.meta.env.VITE_PRIVY_CLIENT_ID || undefined}
    config={{
      loginMethods: ["passkey", "email"],
      embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
      supportedChains: [monadTestnet],
      defaultChain: monadTestnet,
      appearance: { theme: "dark", accentColor: "#8b5cf6" },
    }}
  >
    <App />
  </PrivyProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {app}
  </StrictMode>
);
