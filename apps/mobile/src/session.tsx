import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, loadToken, type UserDTO } from "./lib/api";
import { realtime } from "./lib/realtime";
import { registerPasskey, loginPasskey } from "./lib/passkey";

interface Ctx {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
  signInPasskey: () => Promise<void>;
  createPasskey: (displayName: string) => Promise<void>;
  logout: () => void;
}
const SessionCtx = createContext<Ctx>(null as any);
export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadToken();
      try {
        const { user } = await api.me();
        setUser(user);
        realtime.connect();
        realtime.syncClock();
      } catch {
        await setToken(null);
      }
      setLoading(false);
    })();
  }, []);

  const establish = async (token: string, user: UserDTO) => {
    await setToken(token);
    setUser(user);
    realtime.connect();
    await realtime.syncClock();
  };

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
  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  return (
    <SessionCtx.Provider value={{ user, loading, login, signInPasskey, createPasskey, logout }}>
      {children}
    </SessionCtx.Provider>
  );
}
