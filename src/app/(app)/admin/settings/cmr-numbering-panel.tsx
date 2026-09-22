"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";

type Row = { company: string; pattern: string; resetYearly: boolean; last: number; period: string; preview: string; custom: boolean };
type Edit = { pattern: string; resetYearly: boolean; nextNumber: string };

const TOKENS = "{company} {yyyy} {yy} {MM} {seq:4}";

function previewOf(pattern: string, company: string, n: number) {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  return pattern
    .replace(/\{company\}/g, company)
    .replace(/\{yyyy\}/g, yyyy)
    .replace(/\{yy\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, "0"))
    .replace(/\{seq(?::(\d+))?\}/g, (_m, len) => String(n).padStart(Number(len || 1), "0"));
}

/** Company-wise CMR numbering: each legal entity has its own pattern and counter. */
export function CmrNumberingPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      let companies: string[] = [];
      try {
        const c = await api<{ ok: boolean; companies: { code: string }[] }>("/api/d365/companies");
        if (c.companies?.length) companies = c.companies.map((x) => x.code);
      } catch {
        /* keep default */
      }
      const res = await api<{ ok: boolean; companies: Row[] }>(`/api/admin/cmr-numbering?companies=${encodeURIComponent(companies.join(","))}`);
      setRows(res.companies);
      setEdits(Object.fromEntries(res.companies.map((r) => [r.company, { pattern: r.pattern, resetYearly: r.resetYearly, nextNumber: String(r.last + 1) }])));
    } catch (e) {
      toast.error("Could not load CMR numbering", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(false), 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (row: Row) => {
    const e = edits[row.company];
    if (!e) return;
    const next = Number(e.nextNumber);
    if (!/\{seq(?::\d+)?\}/.test(e.pattern)) return toast.error("Pattern needs {seq} or {seq:4}");
    if (!Number.isInteger(next) || next < 1) return toast.error("Next number must be 1 or higher");
    setSaving(row.company);
    try {
      await api("/api/admin/cmr-numbering", {
        method: "PUT",
        json: { company: row.company, pattern: e.pattern, resetYearly: e.resetYearly, ...(next !== row.last + 1 ? { nextNumber: next } : {}) },
      });
      toast.success(`${row.company} numbering saved`, `Next CMR: ${previewOf(e.pattern, row.company, next)}`);
      await load();
    } catch (err) {
      toast.error("Save failed", (err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const addCompany = () => {
    const code = newCompany.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!code || rows.some((r) => r.company === code)) return;
    const pattern = rows[0]?.pattern.includes("{company}") ? rows[0].pattern : "CMR-{company}-{yyyy}-{seq:4}";
    const row: Row = { company: code, pattern, resetYearly: true, last: 0, period: String(new Date().getFullYear()), preview: previewOf(pattern, code, 1), custom: false };
    setRows([...rows, row]);
    setEdits({ ...edits, [code]: { pattern, resetYearly: true, nextNumber: "1" } });
    setNewCompany("");
  };

  return (
    <Card className="mt-6">
      <CardHeader
        title="Company-wise CMR numbering"
        description="Each legal entity has its own CMR number pattern and counter. The legal entity of the packing slip (dataAreaId) decides which sequence is used."
        actions={
          <Button size="sm" variant="outline" onClick={() => load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <p className="text-[11px] text-ink-500">
          Tokens: <code className="font-mono">{TOKENS}</code>. Counters restart every year when the pattern contains the year. Numbers that already exist
          are skipped automatically.
        </p>
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {rows.map((r) => {
            const e = edits[r.company] ?? { pattern: r.pattern, resetYearly: r.resetYearly, nextNumber: String(r.last + 1) };
            const next = Number(e.nextNumber) || 1;
            return (
              <div key={r.company} className="grid gap-2 p-3 sm:grid-cols-[90px_1fr_120px_auto] sm:items-center">
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-brand-600" />
                  <span className="font-mono text-sm font-bold">{r.company}</span>
                  {!r.custom && <Badge tone="neutral" className="text-[9px]">default</Badge>}
                </div>
                <div className="space-y-1">
                  <Input
                    value={e.pattern}
                    className="font-mono text-xs"
                    onChange={(ev) => setEdits({ ...edits, [r.company]: { ...e, pattern: ev.target.value } })}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
                    <span>
                      Next: <strong className="font-mono text-ink-900">{previewOf(e.pattern, r.company, next)}</strong>
                    </span>
                    <span>Issued this period: {r.last}</span>
                    <Checkbox
                      label="Restart every year"
                      checked={e.resetYearly}
                      onChange={(ev) => setEdits({ ...edits, [r.company]: { ...e, resetYearly: ev.target.checked } })}
                    />
                  </div>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={e.nextNumber}
                  title="Next number to issue"
                  onChange={(ev) => setEdits({ ...edits, [r.company]: { ...e, nextNumber: ev.target.value } })}
                />
                <Button size="sm" onClick={() => save(r)} loading={saving === r.company}>
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
            );
          })}
          {!rows.length && !loading && <div className="p-4 text-center text-xs text-ink-400">No companies found.</div>}
        </div>
        <div className="flex items-center gap-2">
          <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Add company code, e.g. HSDK" className="max-w-[220px] uppercase" />
          <Button size="sm" variant="outline" onClick={addCompany} disabled={!newCompany.trim()}>
            Add company
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
