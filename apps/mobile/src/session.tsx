import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, loadToken, type UserDTO } from "./lib/api";
import { realtime } from "./lib/realtime";

interface Ctx {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
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

  const login = async (email: string, provider = "email", displayName?: string) => {
    const { token, user } = await api.login(email, provider, displayName);
    await setToken(token);
    setUser(user);
    realtime.connect();
    await realtime.syncClock();
  };
  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  return <SessionCtx.Provider value={{ user, loading, login, logout }}>{children}</SessionCtx.Provider>;
}
