import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("pf_token");
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      localStorage.removeItem("pf_token");
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("pf_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const signup = async (full_name, email, password) => {
    const { data } = await api.post("/auth/signup", { full_name, email, password });
    localStorage.setItem("pf_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const logout = () => { localStorage.removeItem("pf_token"); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
