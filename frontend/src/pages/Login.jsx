import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success("Welcome back");
      nav(u.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-white/10">
        <Link to="/" className="font-display text-lg flex items-center gap-2">
          <div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>
          PATHFORGE<span className="text-white/40">.AI</span>
        </Link>
        <div>
          <div className="mono-label mb-4">// return</div>
          <h1 className="font-display text-5xl tracking-tighter leading-none">Continue<br/>your path.</h1>
          <p className="mt-6 text-neutral-400 max-w-md">Forge has been quietly monitoring your progress. Sign in to see what's next.</p>
        </div>
        <div className="mono-label">v1.0 · 2026</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md" data-testid="login-form">
          <div className="mono-label mb-4">// login</div>
          <h2 className="font-display text-3xl mb-8">Sign in</h2>
          <label className="mono-label block mb-2">EMAIL</label>
          <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 mb-4 font-mono-ui text-sm"/>
          <label className="mono-label block mb-2">PASSWORD</label>
          <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 mb-6 font-mono-ui text-sm"/>
          <button data-testid="login-submit" type="submit" disabled={busy} className="btn-primary w-full">{busy ? "SIGNING IN..." : "SIGN IN"}</button>
          <div className="mt-6 text-sm text-neutral-400">New here? <Link to="/signup" className="text-white underline underline-offset-4" data-testid="login-to-signup">Create an account</Link></div>
        </form>
      </div>
    </div>
  );
}
