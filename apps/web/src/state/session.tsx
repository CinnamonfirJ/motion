import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, flushReactionQueue, setToken, getToken, type UnsignedTransactionDTO, type UserDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { registerPasskey, loginPasskey } from "../lib/passkey";
import { useCreateWallet, useLoginWithPasskey, usePrivy, useSendTransaction, useSignupWithPasskey, useWallets, type User as PrivyUser } from "@privy-io/react-auth";

const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID?.trim());

interface SessionCtx {
  user: UserDTO | null;
  loading: boolean;
  authMode: "privy" | "fallback";
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
  signInPasskey: () => Promise<void>;
  createPasskey: (displayName: string) => Promise<void>;
  sendTransaction: (transaction: UnsignedTransactionDTO) => Promise<string>;
  updateProfile: (input: { displayName?: string; handle?: string; avatarUrl?: string | null }) => Promise<{ privySynced: boolean }>;
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
  const updateProfile = async (input: { displayName?: string; handle?: string; avatarUrl?: string | null }) => {
    const { user: updated, privySynced } = await api.updateProfile(input);
    setUser(updated);
    return { privySynced };
  };
  return { user, setUser, establish, updateProfile };
}

function FallbackSessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish, updateProfile } = useAppSessionState();
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
    <Ctx.Provider value={{ user, loading, authMode: "fallback", login, signInPasskey, createPasskey, sendTransaction: async () => { throw new Error("privy-wallet-required"); }, updateProfile, logout }}>{children}</Ctx.Provider>
  );
}

function PrivySessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish, updateProfile } = useAppSessionState();
  const [loading, setLoading] = useState(true);
  const privy = usePrivy();
  const loginComplete = useRef<((user: PrivyUser) => void) | null>(null);
  const authFlowInProgress = useRef(false);
  const onComplete = ({ user: completedUser }: { user: PrivyUser }) => loginComplete.current?.(completedUser);
  const { loginWithPasskey } = useLoginWithPasskey({ onComplete });
  const { signupWithPasskey } = useSignupWithPasskey({ onComplete });
  const { createWallet } = useCreateWallet();
  const { sendTransaction: sendPrivyTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const exchangeInFlight = useRef<Promise<void> | null>(null);

  const exchange = (displayName?: string, completedUser?: PrivyUser): Promise<void> => {
    if (exchangeInFlight.current) return exchangeInFlight.current;
    const pending = (async () => {
      const currentUser = completedUser ?? privy.user;
      if (!currentUser) throw new Error("privy-user-unavailable");
      const hasEmbeddedEvmWallet = currentUser.linkedAccounts.some(
        (account) => account.type === "wallet" && account.chainType === "ethereum" &&
          (account.walletClientType === "privy" || account.walletClientType === "privy-v2")
      );
      if (!hasEmbeddedEvmWallet) await createWallet();
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
        if (privy.authenticated && privy.user && !authFlowInProgress.current && !cancelled) await exchange();
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [privy.ready, privy.authenticated, privy.user?.id]);

  const completePasskeyFlow = async (start: () => Promise<void>, displayName?: string) => {
    authFlowInProgress.current = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const completed = new Promise<PrivyUser>((resolve, reject) => {
      loginComplete.current = resolve;
      timeout = setTimeout(() => reject(new Error("privy-login-completion-timeout")), 20_000);
    });
    // Passkey cancellation can precede the completion callback; keep that pending promise handled.
    void completed.catch(() => undefined);
    try {
      await start();
      await exchange(displayName, await completed);
    } finally {
      clearTimeout(timeout);
      loginComplete.current = null;
      authFlowInProgress.current = false;
    }
  };
  const signInPasskey = () => completePasskeyFlow(loginWithPasskey);
  const createPasskey = (displayName: string) => completePasskeyFlow(signupWithPasskey, displayName);
  const login = async () => {
    throw new Error("Use a Privy passkey to sign in.");
  };
  const logout = async () => {
    setToken(null);
    setUser(null);
    try { await privy.logout(); } catch { /* ignore — we reload to a clean state anyway */ }
    // Hard reload so the Privy SDK re-initializes from scratch; without this, a passkey login
    // immediately after logout can hang (its completion callback never fires) → "didn't land".
    window.location.assign("/");
  };
  const sendTransaction = async (transaction: UnsignedTransactionDTO) => {
    const result = await sendPrivyTransaction(
      { to: transaction.to, data: transaction.data, value: BigInt(transaction.value), chainId: transaction.chainId },
      { address: wallets[0]?.address }
    );
    return result.hash;
  };

  return (
    <Ctx.Provider value={{ user, loading, authMode: "privy", login, signInPasskey, createPasskey, sendTransaction, updateProfile, logout }}>{children}</Ctx.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return PRIVY_ENABLED ? <PrivySessionProvider>{children}</PrivySessionProvider> : <FallbackSessionProvider>{children}</FallbackSessionProvider>;
}
