import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, flushReactionQueue, setToken, getToken, type UnsignedTransactionDTO, type UserDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { registerPasskey, loginPasskey } from "../lib/passkey";
import * as mera from "../lib/mera";

/** Mera is the account layer. `VITE_AUTH_MODE=fallback` keeps the local-only email/WebAuthn demo path. */
const FALLBACK_ONLY = import.meta.env.VITE_AUTH_MODE === "fallback";

interface SessionCtx {
  user: UserDTO | null;
  loading: boolean;
  authMode: "mera" | "fallback";
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
  const { user, setUser, establish, updateProfile } = useAppSessionState();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
          realtime.connect();
          realtime.authenticate();
          realtime.syncClock();
        } catch {
          setToken(null);
          realtime.authenticate();
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
    realtime.authenticate();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, authMode: "fallback", login, signInPasskey, createPasskey, sendTransaction: async () => { throw new Error("mera-wallet-required"); }, updateProfile, logout }}>{children}</Ctx.Provider>
  );
}

/**
 * Mera sessions. Identity is the passkey-derived Monad address; the backend only verifies a
 * signature from it and keeps a convenience app token. The app token and the credential hint in
 * localStorage are both disposable: clearing storage or switching devices costs exactly one
 * passkey prompt, which reconstructs the same address and therefore the same account.
 */
function MeraSessionProvider({ children }: { children: ReactNode }) {
  const { user, setUser, establish, updateProfile } = useAppSessionState();
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const userRef = useRef<UserDTO | null>(null);
  userRef.current = user;

  useEffect(() => {
    api.config().then((c) => mera.setTipContract(c.momentRewardsAddress)).catch(() => undefined);
    if (!getToken()) return;
    let cancelled = false;
    api.me()
      .then((current) => {
        if (cancelled) return;
        // Signed in but locked: the key isn't in memory until the next passkey prompt.
        setUser(current.user);
        realtime.connect();
        realtime.authenticate();
        void realtime.syncClock().catch(() => undefined);
      })
      .catch(() => {
        setToken(null);
        realtime.authenticate();
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /** Prompt-free: the session that the passkey ceremony just opened signs the server challenge. */
  const exchange = async (displayName?: string) => {
    const { message } = await api.meraChallenge();
    const signature = await mera.signMessage(message);
    const session = await api.mera(message, signature, displayName);
    await establish(session.token, session.user);
  };

  const signInPasskey = async () => {
    await mera.unlock();
    await exchange();
  };
  const createPasskey = async (displayName: string) => {
    await mera.createAccount(displayName);
    await exchange(displayName);
  };
  const login = async () => {
    throw new Error("Use a passkey to sign in.");
  };
  const logout = () => {
    mera.lock();
    mera.forgetPasskeyHint();
    setToken(null);
    realtime.authenticate();
    setUser(null);
  };
  const sendTransaction = async (transaction: UnsignedTransactionDTO) => {
    const current = userRef.current;
    if (!current) throw new Error("signed-out");
    const { hash } = await mera.sendTransaction(transaction, current.walletAddress);
    return hash;
  };

  return (
    <Ctx.Provider value={{ user, loading, authMode: "mera", login, signInPasskey, createPasskey, sendTransaction, updateProfile, logout }}>{children}</Ctx.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return FALLBACK_ONLY ? <FallbackSessionProvider>{children}</FallbackSessionProvider> : <MeraSessionProvider>{children}</MeraSessionProvider>;
}
