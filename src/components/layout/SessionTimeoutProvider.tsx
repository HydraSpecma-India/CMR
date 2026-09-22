"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { signOutToLogin } from "@/lib/auth/login-redirect";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui";

const DEFAULT_TIMEOUT_MINUTES = 30; // 30 minutes inactivity timeout
const WARNING_SECONDS = 120; // 2 minutes countdown warning before logout
const STORAGE_KEY = "cmr_session_last_activity";
const LOGOUT_EVENT_KEY = "cmr_session_logout_broadcast";
const THROTTLE_MS = 5000; // Throttle activity updates to localStorage to once every 5s

interface SessionTimeoutContextType {
  lastActivity: number;
  keepAlive: () => void;
  logout: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType>({
  lastActivity: Date.now(),
  keepAlive: () => {},
  logout: () => {},
});

export const useSessionTimeout = () => useContext(SessionTimeoutContext);

interface SessionTimeoutProviderProps {
  children: React.ReactNode;
  timeoutMinutes?: number;
  warningSeconds?: number;
  /** Admin-configured sign-in page (System Settings). Blank → current origin + /signin */
  loginUrl?: string;
}

export function SessionTimeoutProvider({
  children,
  timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  warningSeconds = WARNING_SECONDS,
  loginUrl,
}: SessionTimeoutProviderProps) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = warningSeconds * 1000;

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(warningSeconds);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const lastStorageWriteRef = useRef<number>(0);

  // Perform logout and redirect to signin with reason=inactivity
  const handleLogout = useCallback(() => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setShowWarning(false);

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }

    // Redirect explicitly to the configured login page (NextAuth's own callback URL can
    // resolve to the internal container host on Azure App Service).
    void signOutToLogin(loginUrl, "inactivity");
  }, [isLoggingOut, loginUrl]);

  // Keep session alive - resets timer both in memory and localStorage
  const keepAlive = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastStorageWriteRef.current = now;
    setShowWarning(false);
    setSecondsRemaining(warningSeconds);

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, now.toString());
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [warningSeconds]);

  // Initialize and check last activity on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = Date.now();
    let stored = 0;
    try {
      stored = Number(localStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      stored = 0;
    }

    // If stored activity is older than timeout, user returned after being inactive
    if (stored > 0 && now - stored >= timeoutMs) {
      handleLogout();
      return;
    }

    // Otherwise initialize current activity
    const initialTime = stored > 0 ? stored : now;
    lastActivityRef.current = initialTime;
    try {
      localStorage.setItem(STORAGE_KEY, initialTime.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [handleLogout, timeoutMs]);

  // Register user activity listeners (clicks, keys, mouse moves, scrolls, touches)
  useEffect(() => {
    if (typeof window === "undefined" || isLoggingOut) return;

    const handleUserActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;

      // Throttle localStorage updates to avoid disk/storage thrashing
      if (now - lastStorageWriteRef.current > THROTTLE_MS) {
        lastStorageWriteRef.current = now;
        try {
          localStorage.setItem(STORAGE_KEY, now.toString());
        } catch {
          // Ignore
        }
      }

      // If warning modal was open and user performed activity, dismiss warning
      setShowWarning((prev) => {
        if (prev) {
          setSecondsRemaining(warningSeconds);
          return false;
        }
        return prev;
      });
    };

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel", "click"];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Listen for activity from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const otherTabTime = Number(e.newValue);
        if (otherTabTime > lastActivityRef.current) {
          lastActivityRef.current = otherTabTime;
          setShowWarning(false);
        }
      } else if (e.key === LOGOUT_EVENT_KEY) {
        // Another tab triggered logout
        handleLogout();
      }
    };
    window.addEventListener("storage", handleStorage);

    // When tab becomes visible again or regains focus (e.g. laptop wake), check timeout immediately
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        let stored = lastActivityRef.current;
        try {
          stored = Number(localStorage.getItem(STORAGE_KEY) || lastActivityRef.current);
        } catch {
          // Fallback
        }
        if (now - stored >= timeoutMs) {
          handleLogout();
        } else {
          // Refresh activity on active focus
          handleUserActivity();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [handleLogout, isLoggingOut, timeoutMs, warningSeconds]);

  // Periodic interval loop to check idle time every 1 second
  useEffect(() => {
    if (isLoggingOut) return;

    const interval = setInterval(() => {
      const now = Date.now();
      let last = lastActivityRef.current;
      try {
        const stored = Number(localStorage.getItem(STORAGE_KEY) || 0);
        if (stored > last) {
          last = stored;
          lastActivityRef.current = stored;
        }
      } catch {
        // Fallback
      }

      const elapsed = now - last;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        // Timeout reached -> automatically logout
        handleLogout();
      } else if (remaining <= warningMs) {
        // Warning threshold reached (last 2 minutes)
        setShowWarning(true);
        setSecondsRemaining(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        // Active
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [handleLogout, isLoggingOut, showWarning, timeoutMs, warningMs]);

  // Format mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <SessionTimeoutContext.Provider
      value={{
        lastActivity: lastActivityRef.current,
        keepAlive,
        logout: handleLogout,
      }}
    >
      {children}

      {/* Inactivity Warning Dialog */}
      {showWarning && !isLoggingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                <Clock className="h-6 w-6 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
                  Session Inactivity Warning
                </h3>
                <p className="mt-1 text-xs text-ink-600 leading-relaxed">
                  You have been inactive for over {timeoutMinutes - Math.ceil(warningSeconds / 60)} minutes. To protect shipping and customer data, your session will automatically expire.
                </p>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-center">
              <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                Automatic Sign-Out In
              </div>
              <div className="mt-1 font-mono text-3xl font-extrabold text-amber-950 tracking-wider">
                {formatTime(secondsRemaining)}
              </div>
              <p className="mt-1 text-[11px] text-amber-700">
                Any click or keystroke will automatically keep your session active.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-ink-100">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs text-ink-700 hover:text-red-700 hover:border-red-300"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Sign Out Now
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={keepAlive}
                className="text-xs font-bold shadow-xs px-4"
              >
                Stay Logged In
              </Button>
            </div>
          </div>
        </div>
      )}
    </SessionTimeoutContext.Provider>
  );
}
