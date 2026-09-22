"use client";

import { useState, useRef } from "react";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Badge,
  Field,
  Dialog,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { Plus, Trash2, PenTool, RotateCcw } from "lucide-react";

interface SignatureRow {
  id: string;
  label: string | null;
  storage_path: string;
  is_default: boolean;
  created_at: string;
  dataUrl?: string | null;
}

export function SignaturesClient({ initialSignatures }: { initialSignatures: SignatureRow[] }) {
  const [signatures, setSignatures] = useState<SignatureRow[]>(initialSignatures);
  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState("Sender signature / stamp");
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSaveSignature = async () => {
    if (!canvasRef.current || !hasSignature) {
      toast.error("Please draw a signature first");
      return;
    }

    setSaving(true);
    try {
      const base64Png = canvasRef.current.toDataURL("image/png");
      const res = await api<{ ok: boolean; signature: SignatureRow }>("/api/signatures", {
        method: "POST",
        json: {
          label,
          base64Png,
          isDefault,
        },
      });

      if (res.ok) {
        const nextList = isDefault
          ? signatures.map((s) => ({ ...s, is_default: false }))
          : signatures;
        setSignatures([{ ...res.signature, dataUrl: base64Png }, ...nextList]);
        toast.success("Signature saved successfully");
        setModalOpen(false);
      }
    } catch (e) {
      toast.error("Failed to save signature", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api("/api/signatures", {
        method: "PATCH",
        json: { id, isDefault: true },
      });
      setSignatures(signatures.map((s) => ({ ...s, is_default: s.id === id })));
      toast.success("Default signature updated");
    } catch (e) {
      toast.error("Failed to update default signature", (e as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/signatures?id=${id}`, { method: "DELETE" });
      setSignatures(signatures.filter((s) => s.id !== id));
      toast.success("Signature removed");
    } catch (e) {
      toast.error("Failed to delete", (e as Error).message);
    }
  };

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Stored Signatures"
        description="Manage sender signatures and company stamps (box 22) that can be attached to CMR consignment notes."
        actions={
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Signature
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {signatures.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-ink-300 bg-white p-12 text-center text-sm text-ink-500">
            <PenTool className="mx-auto h-8 w-8 text-ink-400 mb-2" />
            No stored signatures found. Click &quot;Add Signature&quot; to draw and save your official stamp.
          </div>
        ) : (
          signatures.map((sig) => (
            <Card key={sig.id}>
              <CardHeader
                title={sig.label || "Digital Signature"}
                actions={
                  <div className="flex items-center gap-1">
                    {sig.is_default && <Badge tone="success">Default</Badge>}
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(sig.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                }
              />
              <CardBody>
                <div className="flex h-28 items-center justify-center rounded-lg border border-ink-200 bg-white p-2 shadow-inner">
                  {sig.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sig.dataUrl}
                      alt={sig.label || "Digital Signature"}
                      className="max-h-24 max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-ink-400">
                      <PenTool className="h-6 w-6 opacity-40" />
                      <span className="font-mono text-xs text-ink-500">Stored Signature</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-500">
                  <span>Added: {new Date(sig.created_at).toLocaleDateString()}</span>
                  {!sig.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(sig.id)}
                      className="h-6 px-2 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:bg-brand-50"
                    >
                      Set as Default
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} title="Draw New Digital Signature">
        <div className="space-y-4">
          <Field label="Signature Label" hint="e.g. Shipping office Skjern">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-ink-600">Draw Signature</label>
              <button onClick={clearCanvas} className="text-xs text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            </div>
            <div className="rounded border-2 border-dashed border-ink-300 bg-ink-50/40 p-2 flex justify-center">
              <canvas
                ref={canvasRef}
                width={400}
                height={140}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="rounded border border-ink-200 bg-white cursor-crosshair"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 accent-ink-900"
            />
            Set as default signature for my account
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-200">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSaveSignature}>
              Save Signature
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
