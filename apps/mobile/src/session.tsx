import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useEmbeddedEthereumWallet, usePrivy } from "@privy-io/expo";
import { useLoginWithPasskey, useSignupWithPasskey } from "@privy-io/expo/passkey";
import { api, setToken, loadToken, type UnsignedTransactionDTO, type UserDTO } from "./lib/api";
import { realtime } from "./lib/realtime";
import { registerPasskey, loginPasskey } from "./lib/passkey";
import { flushReactionQueue } from "./lib/reaction-queue";

const PRIVY_ENABLED = Boolean(process.env.EXPO_PUBLIC_PRIVY_APP_ID?.trim());
const RELYING_PARTY = process.env.EXPO_PUBLIC_PRIVY_RELYING_PARTY?.trim() || "https://ennoia.app";

interface Ctx {
  user: UserDTO | null;
  loading: boolean;
  authMode: "privy" | "fallback";
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
  signInPasskey: () => Promise<void>;
  createPasskey: (displayName: string) => Promise<void>;
  sendTransaction: (transaction: UnsignedTransactionDTO) => Promise<string>;
  updateProfile: (input: { displayName?: string; handle?: string; avatarUrl?: string | null }) => Promise<{ privySynced: boolean }>;
  logout: () => Promise<void>;
}

const SessionCtx = createContext<Ctx>(null as never);
export const useSession = () => useContext(SessionCtx);

function useAppSession() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const establish = async (nextToken: string, nextUser: UserDTO) => {
    await setToken(nextToken);
    setUser(nextUser);
    realtime.connect();
    realtime.authenticate();
    await realtime.syncClock();
    await flushReactionQueue();
  };
  const updateProfile = async (input: { displayName?: string; handle?: string; avatarUrl?: string | null }) => {
    const { user: updated, privySynced } = await api.updateProfile(input);
    setUser(updated);
    return { privySynced };
  };
  return { user, setUser, establish, updateProfile };
}

function FallbackSessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish, updateProfile } = useAppSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      await loadToken();
      try {
        const current = await api.me();
        setUser(current.user);
        realtime.connect();
        realtime.authenticate();
        await realtime.syncClock();
      } catch {
        await setToken(null);
        realtime.authenticate();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, provider = "email", displayName?: string) => {
    const session = await api.login(email, provider, displayName);
    await establish(session.token, session.user);
  };
  const signInPasskey = async () => {
    const session = await loginPasskey();
    await establish(session.token, session.user);
  };
  const createPasskey = async (displayName: string) => {
    const session = await registerPasskey(displayName);
    await establish(session.token, session.user);
  };
  const logout = async () => {
    await setToken(null);
    realtime.authenticate();
    setUser(null);
  };

  return (
    <SessionCtx.Provider value={{
      user,
      loading,
      authMode: "fallback",
      login,
      signInPasskey,
      createPasskey,
      sendTransaction: async () => { throw new Error("privy-wallet-required"); },
      updateProfile,
      logout,
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

function PrivySessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish, updateProfile } = useAppSession();
  const [loading, setLoading] = useState(true);
  const privy = usePrivy();
  const embedded = useEmbeddedEthereumWallet();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const exchangeInFlight = useRef<Promise<void> | null>(null);

  const exchange = (displayName?: string): Promise<void> => {
    if (exchangeInFlight.current) return exchangeInFlight.current;
    const pending = (async () => {
      if (embedded.wallets.length === 0) await embedded.create();
      const accessToken = await privy.getAccessToken();
      if (!accessToken) throw new Error("privy-access-token-unavailable");
      const session = await api.privy(accessToken, displayName);
      await establish(session.token, session.user);
    })();
    exchangeInFlight.current = pending;
    void pending.finally(() => {
      if (exchangeInFlight.current === pending) exchangeInFlight.current = null;
    }).catch(() => undefined);
    return pending;
  };

  useEffect(() => {
    if (!privy.isReady) return;
    let cancelled = false;
    void (async () => {
      await loadToken();
      try {
        const current = await api.me();
        if (!cancelled) {
          setUser(current.user);
          realtime.connect();
          realtime.authenticate();
          await realtime.syncClock();
        }
      } catch {
        await setToken(null);
        realtime.authenticate();
        if (privy.user && !cancelled) await exchange();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [privy.isReady, privy.user?.id]);

  const signInPasskey = async () => {
    await loginWithPasskey({ relyingParty: RELYING_PARTY });
    await exchange();
  };
  const createPasskey = async (displayName: string) => {
    await signupWithPasskey({ relyingParty: RELYING_PARTY });
    await exchange(displayName);
  };
  const sendTransaction = async (transaction: UnsignedTransactionDTO): Promise<string> => {
    const wallet = embedded.wallets[0];
    if (!wallet) throw new Error("embedded-wallet-not-ready");
    const provider = await wallet.getProvider();
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${transaction.chainId.toString(16)}` }] });
    return provider.request({
      method: "eth_sendTransaction",
      params: [{ from: wallet.address, to: transaction.to, data: transaction.data, value: transaction.value }],
    }) as Promise<string>;
  };
  const logout = async () => {
    await setToken(null);
    realtime.authenticate();
    setUser(null);
    await privy.logout();
  };

  return (
    <SessionCtx.Provider value={{
      user,
      loading,
      authMode: "privy",
      login: async () => { throw new Error("Use your Privy passkey to sign in."); },
      signInPasskey,
      createPasskey,
      sendTransaction,
      updateProfile,
      logout,
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return PRIVY_ENABLED
    ? <PrivySessionProvider>{children}</PrivySessionProvider>
    : <FallbackSessionProvider>{children}</FallbackSessionProvider>;
}
