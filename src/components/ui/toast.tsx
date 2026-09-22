"use client";

import * as React from "react";
import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "success" | "error" | "info";
interface Toast { id: number; tone: Tone; title: string; description?: string }

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 1;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "error" ? 8000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ tone: "success", title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ tone: "error", title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ tone: "info", title, description }),
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-md border bg-white p-3 shadow-lg",
              t.tone === "success" && "border-emerald-200",
              t.tone === "error" && "border-red-200",
              t.tone === "info" && "border-sky-200",
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "success" && "text-emerald-600", t.tone === "error" && "text-red-600", t.tone === "info" && "text-sky-600")} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-900">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs text-ink-500 break-words">{t.description}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
