"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, FileDown, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Field, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { PdfViewer } from "@/components/cmr/PdfViewer";
import { api } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils/cn";
import { CMR_COPIES, WIZARD_SECTIONS, labelFor } from "@/lib/cmr/layout";
import { fmt, goodsTotals } from "@/lib/cmr/goods";
import type { CmrGoodsLine } from "@/lib/cmr/types";
import { STATUS_TONE, statusLabel } from "../history/history-client";

interface Doc {
  id: string;
  cmr_number: string | null;
  company: string;
  packing_slip_id: string;
  sales_order: string | null;
  customer_account: string | null;
  incoterms: string | null;
  status: string;
  data_mode: "live" | "mock";
  template_version_number: number | null;
  template_version_id: string | null;
  pdf_sha256: string | null;
  last_error: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  goods_json: CmrGoodsLine[];
  form_values: Record<string, string>;
  signed: string[];
}
interface Step {
  id: string;
  step: string;
  status: string;
  started_at: string;
  error: string | null;
  details: Record<string, unknown> | null;
}

export function CmrDetail({ doc, steps, canCancel, canRetry }: { doc: Doc; steps: Step[]; canCancel: boolean; canRetry: boolean }) {
  const router = useRouter();
  const [copy, setCopy] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const v = doc.form_values;
  const totals = goodsTotals(doc.goods_json || []);
  const pdfSrc = `/api/cmr/${doc.id}/pdf${copy ? `?copy=${copy}` : ""}`;

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/cmr/${doc.id}/cancel`, { method: "POST", json: { reason } });
      toast.success(`CMR ${doc.cmr_number} cancelled`);
      setCancelOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Cancel failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/api/cmr/${doc.id}/retry`, { method: "POST" });
      toast.success(`PDF stored (${statusLabel(r.status)})`);
      router.refresh();
    } catch (e) {
      toast.error("Retry failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`CMR ${doc.cmr_number ?? ""}`}
        description={`Packing slip ${doc.packing_slip_id} · sales order ${doc.sales_order ?? "–"} · ${doc.company} · issued ${new Date(doc.created_at).toLocaleString()}`}
        crumbs={[{ label: "CMR register", href: "/cmr/history" }, { label: doc.cmr_number ?? doc.id }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[doc.status] ?? "neutral"}>{statusLabel(doc.status)}</Badge>
            {doc.data_mode === "mock" && <Badge tone="warning">DEMO data</Badge>}
            <a href={`/api/cmr/${doc.id}/pdf?download=1`}>
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4" /> Download
              </Button>
            </a>
            {canRetry && ["UPLOAD_FAILED", "PDF_GENERATED", "DRAFT"].includes(doc.status) && (
              <Button size="sm" variant="outline" onClick={() => void retry()} loading={busy}>
                <RefreshCw className="h-4 w-4" /> Retry storage
              </Button>
            )}
            {canCancel && doc.status !== "CANCELLED" && (
              <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" /> Cancel CMR
              </Button>
            )}
          </div>
        }
      />

      {doc.status === "CANCELLED" && (
        <Alert tone="warning" title={`Cancelled ${doc.cancelled_at ? new Date(doc.cancelled_at).toLocaleString() : ""}`}>
          {doc.cancel_reason}. The packing slip can be issued again from{" "}
          <Link className="underline" href={`/cmr/new?company=${doc.company}&ps=${encodeURIComponent(doc.packing_slip_id)}`}>
            New CMR
          </Link>
          .
        </Alert>
      )}
      {doc.last_error && doc.status !== "CANCELLED" && <Alert tone="danger" title="Last error">{doc.last_error}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,560px)]">
        <div className="space-y-5">
          {WIZARD_SECTIONS.map((sec) => {
            const filled = sec.fields.filter((f) => v[f]);
            if (!filled.length) return null;
            return (
              <Card key={sec.title}>
                <CardHeader title={sec.title} description={sec.boxes} />
                <CardBody className="grid gap-3 sm:grid-cols-2">
                  {filled.map((f) => (
                    <div key={f} className={cn(v[f].includes("\n") && "sm:col-span-2")}>
                      <div className="text-xs text-ink-500">{labelFor(f)}</div>
                      <div className="whitespace-pre-line text-sm text-ink-900">{v[f] === "X" ? "✓" : v[f]}</div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            );
          })}

          <Card>
            <CardHeader title="Goods (boxes 6–12)" />
            <Table>
              <thead>
                <tr>
                  <Th>Marks</Th>
                  <Th className="text-right">Pkgs</Th>
                  <Th>Packing</Th>
                  <Th>Nature of goods</Th>
                  <Th>Stat. no.</Th>
                  <Th className="text-right">Gross kg</Th>
                  <Th className="text-right">m³</Th>
                </tr>
              </thead>
              <tbody>
                {(doc.goods_json || []).map((g, i) => (
                  <tr key={i}>
                    <Td>{g.marks}</Td>
                    <Td className="text-right">{g.packages}</Td>
                    <Td>{g.packing}</Td>
                    <Td>{g.nature}</Td>
                    <Td>{g.statNo}</Td>
                    <Td className="text-right">{g.grossWeight}</Td>
                    <Td className="text-right">{g.volume}</Td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <Td>Total</Td>
                  <Td className="text-right">{fmt(totals.packages, 0)}</Td>
                  <Td> </Td>
                  <Td> </Td>
                  <Td> </Td>
                  <Td className="text-right">{fmt(totals.weight)}</Td>
                  <Td className="text-right">{fmt(totals.volume, 3)}</Td>
                </tr>
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Processing" description={`Template version ${doc.template_version_number ?? "built-in"}${doc.pdf_sha256 ? ` · SHA-256 ${doc.pdf_sha256.slice(0, 16)}…` : ""}${doc.signed.length ? ` · signed: ${doc.signed.join(", ")}` : ""}`} />
            <CardBody>
              <ol className="space-y-2 text-sm">
                {steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-3">
                    <Badge tone={s.status === "OK" ? "success" : s.status === "FAILED" ? "danger" : "neutral"}>{s.status}</Badge>
                    <div>
                      <div className="font-medium">{s.step.replace(/_/g, " ")}</div>
                      <div className="text-xs text-ink-500">
                        {new Date(s.started_at).toLocaleString()}
                        {s.error ? ` · ${s.error}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
                {!steps.length && <li className="text-ink-500">No process steps recorded.</li>}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCopy(0)} className={cn("rounded-full border border-ink-300 px-2.5 py-0.5 text-xs", copy === 0 ? "bg-ink-900 text-white" : "bg-white")}>
                  All 4 copies
                </button>
                {CMR_COPIES.map((c) => (
                  <button
                    key={c.no}
                    onClick={() => setCopy(c.no)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", copy === c.no ? "text-white" : "bg-white text-ink-700")}
                    style={copy === c.no ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
                  >
                    {c.no} · {c.en.replace("Copy for ", "")}
                  </button>
                ))}
              </div>
              <PdfViewer key={pdfSrc} src={pdfSrc} title={`CMR ${doc.cmr_number}`} downloadName={`${doc.cmr_number}.pdf`} desktopHeight="h-[760px]" />
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel CMR ${doc.cmr_number}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep</Button>
            <Button variant="danger" onClick={() => void cancel()} loading={busy} disabled={reason.trim().length < 3}>Cancel CMR</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-600">
          The number stays used and the PDF is kept for the audit trail. Destroy or mark the printed copies as void. Afterwards packing slip {doc.packing_slip_id} can be issued again.
        </p>
        <Field label="Reason">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong carrier, load split" />
        </Field>
      </Dialog>
    </div>
  );
}
