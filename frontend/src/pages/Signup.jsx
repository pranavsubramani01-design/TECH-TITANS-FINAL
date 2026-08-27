import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await signup(form.full_name.trim(), form.email.trim(), form.password);
      toast.success("Account created");
      nav("/onboarding");
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "Signup failed");
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
          <div className="mono-label mb-4">// begin</div>
          <h1 className="font-display text-5xl tracking-tighter leading-none">Let Forge<br/>meet you.</h1>
          <p className="mt-6 text-neutral-400 max-w-md">In the next 8 minutes we'll map who you are, what you're good at, and where you're headed. Everything after that is personalised.</p>
        </div>
        <div className="mono-label">STEP 0 / 15</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md" data-testid="signup-form">
          <div className="mono-label mb-4">// create account</div>
          <h2 className="font-display text-3xl mb-8">Sign up</h2>
          {[
            { k: "full_name", label: "FULL NAME", type: "text", testid: "signup-name" },
            { k: "email", label: "EMAIL", type: "email", testid: "signup-email" },
            { k: "password", label: "PASSWORD", type: "password", testid: "signup-password" },
            { k: "confirm", label: "CONFIRM PASSWORD", type: "password", testid: "signup-confirm" },
          ].map((f) => (
            <div key={f.k} className="mb-4">
              <label className="mono-label block mb-2">{f.label}</label>
              <input data-testid={f.testid} required type={f.type} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 font-mono-ui text-sm"/>
            </div>
          ))}
          <button data-testid="signup-submit" type="submit" disabled={busy} className="btn-primary w-full mt-2">{busy ? "CREATING..." : "CREATE ACCOUNT"}</button>
          <div className="mt-6 text-sm text-neutral-400">Have an account? <Link to="/login" className="text-white underline underline-offset-4" data-testid="signup-to-login">Sign in</Link></div>
        </form>
      </div>
    </div>
  );
}
