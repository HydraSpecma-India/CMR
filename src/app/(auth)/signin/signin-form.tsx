"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Clock, KeyRound, ArrowLeft } from "lucide-react";

interface Props {
  callbackUrl: string;
  initialError?: string;
  reason?: string;
  hasEntra: boolean;
}

export function SignInForm({ callbackUrl, initialError, reason, hasEntra }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  // "New user / set password" mode – uses the 6-digit passcode from the administrator
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [passcode, setPasscode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (!initialError) return null;
    if (initialError === "InvalidCredentials" || initialError === "CredentialsSignin") {
      return "Invalid work email or password. Please check your credentials.";
    } else if (initialError === "AccessDenied") {
      return "Your account does not have permission or has been deactivated.";
    } else if (initialError === "SSOUnavailable") {
      return "Microsoft 365 SSO is not currently active.";
    }
    return `Sign-in failed (${initialError}).`;
  });

  const goAfterLogin = (resUrl?: string | null) => {
    // 1. Prefer the explicit callbackUrl passed from the server page
    if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.startsWith("/signin")) {
      window.location.href = callbackUrl;
      return;
    }
    // 2. Use the URL returned by NextAuth (skip if it points back to /signin)
    if (resUrl) {
      try {
        const parsed = new URL(resUrl);
        const target = parsed.port === "8080" || !parsed.hostname.includes(".")
          ? parsed.pathname + parsed.search
          : resUrl;
        // Don't redirect back to signin – that means the redirect callback looped
        if (!target.startsWith("/signin") && !parsed.pathname.startsWith("/signin")) {
          window.location.href = target;
          return;
        }
      } catch {
        /* ignore malformed URLs */
      }
    }
    // 3. Fallback: go to the dashboard root
    window.location.href = "/";
  };

  const checkSetupRequired = async (addr: string): Promise<boolean> => {
    try {
      const r = await fetch("/api/auth/account-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr.trim() }),
      });
      if (!r.ok) return false;
      return Boolean((await r.json()).setupRequired);
    } catch {
      return false;
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!/^\d{6}$/.test(passcode)) return setError("Enter the 6-digit passcode you received from your administrator.");
    if (newPw.length < 6) return setError("Your new password must be at least 6 characters.");
    if (newPw !== confirmPw) return setError("The two passwords do not match.");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: passcode, password: newPw }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error?.message || "Could not set the password.");
        setLoading(false);
        return;
      }
      // Password saved – sign straight in
      const res = await signIn("credentials", { email: email.trim(), password: newPw, redirect: false, callbackUrl });
      if (res?.error) {
        setMode("signin");
        setPassword("");
        setInfo("Password saved. Please sign in with your new password.");
        setLoading(false);
        return;
      }
      goAfterLogin(res?.url);
    } catch (err) {
      setError((err as Error).message || "Could not set the password.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setInfo(null);
    if (!password) {
      // Empty password: new users have none yet – offer the passcode flow
      setLoading(true);
      const needs = await checkSetupRequired(email);
      setLoading(false);
      if (needs) {
        setMode("setup");
        setInfo("Your account has no password yet. Enter the 6-digit passcode from your administrator and choose a password.");
      } else {
        setError("Please enter your password.");
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });

      // NextAuth v5 beta: res = { error, status, ok, url }
      if (res?.error || res?.ok === false) {
        console.warn("[CMR] signIn failed:", res);
        if (await checkSetupRequired(email)) {
          setMode("setup");
          setInfo("Your account needs a new password. Enter the 6-digit passcode from your administrator and choose a password.");
        } else {
          setError("Invalid email or password. Please check your credentials and try again.");
        }
        setLoading(false);
        return;
      }

      console.log("[CMR] signIn success, redirecting…", { url: res?.url, callbackUrl });
      goAfterLogin(res?.url);
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred during sign-in.");
      setLoading(false);
    }
  };

  const handleSso = async () => {
    if (ssoLoading) return;
    setSsoLoading(true);
    setError(null);
    try {
      await signIn("microsoft-entra-id", { callbackUrl });
    } catch {
      setError("Failed to initiate Microsoft 365 SSO.");
      setSsoLoading(false);
    }
  };

  return (
    <div>
      {reason === "inactivity" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in shadow-xs">
          <div className="rounded-full bg-amber-100 p-1 text-amber-700 shrink-0 mt-0.5 border border-amber-200">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-amber-950">Session Timed Out</p>
            <p className="mt-0.5 text-amber-800 leading-relaxed">
              Your session expired after a period of inactivity. Please sign in to resume your work.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 leading-relaxed">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 leading-relaxed">{info}</div>
      )}

      {mode === "setup" ? (
        <form onSubmit={handleSetup} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <KeyRound className="h-4 w-4 text-brand-600" /> New user – set your password
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Work Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium"
              placeholder="name@hydraspecma.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">6-digit passcode (from your administrator)</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-12 w-full rounded-md border border-ink-300 bg-white px-3 text-center font-mono text-2xl tracking-[0.5em] text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
              placeholder="••••••"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">New password (min. 6 characters)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-500 text-sm font-bold text-ink-900 hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-75"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Set password &amp; sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
            }}
            className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </button>
        </form>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Work Email</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading || ssoLoading}
            className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium disabled:opacity-60 disabled:bg-ink-50"
            placeholder="name@hydraspecma.com"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-ink-700">Password</label>
          </div>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading || ssoLoading}
            className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium disabled:opacity-60 disabled:bg-ink-50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading || ssoLoading}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-500 text-sm font-bold text-ink-900 hover:bg-brand-600 transition-colors shadow-sm cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-ink-900" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign In</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("setup");
            setError(null);
            setInfo(null);
          }}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-brand-800 hover:underline"
        >
          <KeyRound className="h-3.5 w-3.5" /> New user / set password with passcode
        </button>
      </form>
      )}

      {/* Live Microsoft 365 SSO Section */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-ink-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-ink-400 font-medium">Or continue with</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSso}
        disabled={loading || ssoLoading || !hasEntra}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-ink-300 bg-white text-xs font-semibold text-ink-800 hover:bg-ink-50 transition-colors cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {ssoLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-ink-600" />
            <span>Connecting to Microsoft 365...</span>
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <span>Sign in with Microsoft 365 (SSO)</span>
          </>
        )}
      </button>
    </div>
  );
}
