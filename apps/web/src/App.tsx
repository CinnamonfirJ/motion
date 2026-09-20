import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "./state/session";
import { Layout } from "./components/Layout";
import { SignIn } from "./screens/SignIn";
import { Home } from "./screens/Home";
import { Live } from "./screens/Live";
import { Moments } from "./screens/Moments";
import { MomentDetail } from "./screens/MomentDetail";
import { Earnings } from "./screens/Earnings";
import { Profile } from "./screens/Profile";

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-warning/15 text-warning text-center text-bodysm py-1.5">
      You're offline · reactions will send when you reconnect
    </div>
  );
}

function Gate() {
  const { user, loading } = useSession();
  if (loading)
    return (
      <div className="min-h-screen grid place-items-center bg-night">
        <div className="h-8 w-8 rounded-full border-2 border-lime border-t-transparent animate-spin" />
      </div>
    );
  if (!user) return <SignIn />;

  return (
    <Routes>
      <Route path="/live/:id" element={<Live />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/moments" element={<Moments />} />
        <Route path="/moments/:id" element={<MomentDetail />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <OfflineBanner />
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}
