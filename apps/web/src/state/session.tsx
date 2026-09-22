import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, flushReactionQueue, setToken, getToken, type UnsignedTransactionDTO, type UserDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { registerPasskey, loginPasskey } from "../lib/passkey";
import { useLoginWithPasskey, usePrivy, useSendTransaction, useSignupWithPasskey, useWallets } from "@privy-io/react-auth";

const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID?.trim());

interface SessionCtx {
  user: UserDTO | null;
  loading: boolean;
  authMode: "privy" | "fallback";
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
  signInPasskey: () => Promise<void>;
  createPasskey: (displayName: string) => Promise<void>;
  sendTransaction: (transaction: UnsignedTransactionDTO) => Promise<string>;
  logout: () => void | Promise<void>;
}

const Ctx = createContext<SessionCtx>(null as any);
export const useSession = () => useContext(Ctx);

function useAppSessionState() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const establish = async (token: string, nextUser: UserDTO) => {
    setToken(token);
    setUser(nextUser);
    realtime.connect();
    await realtime.syncClock();
    await flushReactionQueue();
  };
  return { user, setUser, establish };
}

function FallbackSessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish } = useAppSessionState();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
          realtime.connect();
          realtime.syncClock();
        } catch {
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, provider = "email", displayName?: string) => {
    const { token, user } = await api.login(email, provider, displayName);
    await establish(token, user);
  };

  const signInPasskey = async () => {
    const { token, user } = await loginPasskey();
    await establish(token, user);
  };

  const createPasskey = async (displayName: string) => {
    const { token, user } = await registerPasskey(displayName);
    await establish(token, user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, authMode: "fallback", login, signInPasskey, createPasskey, sendTransaction: async () => { throw new Error("privy-wallet-required"); }, logout }}>{children}</Ctx.Provider>
  );
}

function PrivySessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish } = useAppSessionState();
  const [loading, setLoading] = useState(true);
  const privy = usePrivy();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const { sendTransaction: sendPrivyTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const exchangeInFlight = useRef<Promise<void> | null>(null);
  const pendingDisplayName = useRef<string | undefined>(undefined);

  const exchange = (displayName?: string): Promise<void> => {
    if (exchangeInFlight.current) return exchangeInFlight.current;
    const requestedDisplayName = displayName ?? pendingDisplayName.current;
    const pending = (async () => {
      const accessToken = await privy.getAccessToken();
      if (!accessToken) throw new Error("privy-access-token-unavailable");
      const session = await api.privy(accessToken, requestedDisplayName);
      await establish(session.token, session.user);
    })();
    exchangeInFlight.current = pending;
    void pending.finally(() => {
      if (exchangeInFlight.current === pending) exchangeInFlight.current = null;
    }).catch(() => undefined);
    return pending;
  };

  useEffect(() => {
    if (!privy.ready) return;
    let cancelled = false;
    (async () => {
      try {
        if (getToken()) {
          const current = await api.me();
          if (!cancelled) {
            setUser(current.user);
            realtime.connect();
            await realtime.syncClock();
            return;
          }
        }
        if (privy.authenticated && !cancelled) await exchange();
      } catch {
        setToken(null);
        if (privy.authenticated && !cancelled) {
          try { await exchange(); } catch { /* sign-in screen will offer a retry */ }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [privy.ready, privy.authenticated]);

  const signInPasskey = async () => {
    await loginWithPasskey();
    await exchange();
  };
  const createPasskey = async (displayName: string) => {
    pendingDisplayName.current = displayName;
    try {
      await signupWithPasskey();
      await exchange(displayName);
    } finally {
      pendingDisplayName.current = undefined;
    }
  };
  const login = async () => {
    throw new Error("Use a Privy passkey to sign in.");
  };
  const logout = async () => {
    setToken(null);
    setUser(null);
    await privy.logout();
  };
  const sendTransaction = async (transaction: UnsignedTransactionDTO) => {
    const result = await sendPrivyTransaction(
      { to: transaction.to, data: transaction.data, value: BigInt(transaction.value), chainId: transaction.chainId },
      { address: wallets[0]?.address }
    );
    return result.hash;
  };

  return (
    <Ctx.Provider value={{ user, loading, authMode: "privy", login, signInPasskey, createPasskey, sendTransaction, logout }}>{children}</Ctx.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return PRIVY_ENABLED ? <PrivySessionProvider>{children}</PrivySessionProvider> : <FallbackSessionProvider>{children}</FallbackSessionProvider>;
}
