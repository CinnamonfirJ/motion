import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken, type UserDTO } from "../lib/api";
import { realtime } from "../lib/realtime";

interface SessionCtx {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, provider?: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<SessionCtx>(null as any);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
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
    setToken(token);
    setUser(user);
    realtime.connect();
    await realtime.syncClock();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
