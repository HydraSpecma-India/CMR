"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw, Save, Type } from "lucide-react";
import { Button, Checkbox, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils/cn";
import {
  SIGNATURE_COLORS, SIGNATURE_FONTS, defaultSignatureStyle, loadLocalStyle, renderAutoSignature, saveLocalStyle,
  type SignatureStyle,
} from "@/lib/signature/auto-signature";

/**
 * Personal auto-signature editor: every user chooses the handwriting font, colour, size and the
 * text/details printed with the signature. Saved per user (server) and remembered on the device.
 */
export function SignatureDesigner({ userName, onChange }: { userName: string; onChange: (dataUrl: string) => void }) {
  const [style, setStyle] = useState<SignatureStyle>(() => loadLocalStyle() ?? defaultSignatureStyle(userName));
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load the saved style from the server once
  useEffect(() => {
    let active = true;
    api<{ ok: boolean; style: SignatureStyle | null }>("/api/signatures/style")
      .then((r) => {
        if (active && r.style) setStyle({ ...defaultSignatureStyle(userName), ...r.style });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userName]);

  // Re-render the image whenever the style changes
  useEffect(() => {
    let active = true;
    renderAutoSignature(style).then((url) => {
      if (!active || !url) return;
      setPreview(url);
      onChangeRef.current(url);
    });
    return () => {
      active = false;
    };
  }, [style]);

  const set = (patch: Partial<SignatureStyle>) => {
    setStyle((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    saveLocalStyle(style);
    try {
      await api("/api/signatures/style", { method: "PUT", json: { style } });
      setDirty(false);
      toast.success("Signature style saved", "It will be used for all your CMRs.");
    } catch (e) {
      toast.error("Saved on this device only", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex min-h-32 items-center justify-center rounded-lg border border-brand-200 bg-white p-3 shadow-inner">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Signature preview" className="max-h-32 w-full max-w-[480px] object-contain" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Signature text</span>
          <Input value={style.signatureText} onChange={(e) => set({ signatureText: e.target.value })} placeholder={userName} maxLength={80} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Size</span>
          <input type="range" min={20} max={56} value={style.size} onChange={(e) => set({ size: Number(e.target.value) })} className="h-10 w-full accent-ink-900" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Line 1 (designation)</span>
          <Input value={style.line1} onChange={(e) => set({ line1: e.target.value })} placeholder="Shipping coordinator" maxLength={80} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Line 2 (department / company)</span>
          <Input value={style.line2} onChange={(e) => set({ line2: e.target.value })} placeholder="HydraSpecma – Logistics" maxLength={80} />
        </label>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-600">
          <Type className="h-3.5 w-3.5" /> Font
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIGNATURE_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => set({ font: f.id })}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-lg border bg-white px-2 transition-colors",
                style.font === f.id ? "border-ink-900 ring-2 ring-brand-400" : "border-ink-200 hover:border-ink-400",
              )}
            >
              <span style={{ fontFamily: f.css, fontWeight: f.weight, fontSize: 20 * f.scale, color: style.color }} className="leading-none truncate max-w-full">
                {(style.signatureText || userName || "Signature").split(" ")[0]}
              </span>
              <span className="mt-1 text-[10px] text-ink-500">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-ink-600">Ink</span>
        {SIGNATURE_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => set({ color: c.id })}
            className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2", style.color === c.id ? "border-ink-900" : "border-transparent")}
            style={{ background: c.id }}
          >
            {style.color === c.id && <Check className="h-4 w-4 text-white" />}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox label="Date" checked={style.showDate} onChange={(e) => set({ showDate: e.target.checked })} />
        <Checkbox label="Time" checked={style.showTime} onChange={(e) => set({ showTime: e.target.checked })} />
        <Checkbox label="“Digitally signed”" checked={style.showVerifiedLine} onChange={(e) => set({ showVerifiedLine: e.target.checked })} />
        <Checkbox label="Tick badge" checked={style.showBadge} onChange={(e) => set({ showBadge: e.target.checked })} />
        <Checkbox label="Frame" checked={style.showBorder} onChange={(e) => set({ showBorder: e.target.checked })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
          <Save className="h-3.5 w-3.5" /> Save as my signature
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setStyle(defaultSignatureStyle(userName));
            setDirty(true);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        {dirty && <span className="text-[11px] text-ink-500">Changes apply to this CMR now; save to keep them.</span>}
      </div>
    </div>
  );
}
