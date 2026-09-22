"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileDown, FileText, Plus, RefreshCw, Search, Trash2, Truck,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Spinner, Table, Td, Textarea, Th,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { PdfViewer } from "@/components/cmr/PdfViewer";
import { SignatureDesigner } from "@/components/cmr/SignatureDesigner";
import { api, ApiError } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils/cn";
import {
  CMR_COPIES, REQUIRED_FIELDS, WIZARD_SECTIONS, isCheckboxField, isMultilineField, labelFor,
} from "@/lib/cmr/layout";
import { emptyGoodsLine, fmt, goodsTotals, num } from "@/lib/cmr/goods";
import type { CmrGoodsLine, CmrPrefill, PackingSlipSummary, ValueSource } from "@/lib/cmr/types";

type Prefill = Omit<CmrPrefill, "context">;
type Company = { code: string; name: string };
type SavedSignature = { id: string; label: string; is_default: boolean; dataUrl: string | null };
type SigMode = "paper" | "saved" | "generate";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};

const sourceTone: Record<ValueSource, "info" | "brand" | "neutral" | "warning"> = {
  D365: "info",
  SETTING: "brand",
  SYSTEM: "neutral",
  MANUAL: "warning",
};

export function CmrWizard(props: {
  userName: string;
  allowedCompanies: string[];
  preferredCompanies: string[];
  defaultCompany: string;
  initialPackingSlip?: string;
  signatureRequired: boolean;
  d365Mode: "mock" | "live";
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  /* ── step 1: company + packing slip search ── */
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState(props.defaultCompany);
  const [query, setQuery] = useState(props.initialPackingSlip ?? "");
  const [from, setFrom] = useState(daysAgo(14));
  const [to, setTo] = useState(isoDay(new Date()));
  const [slips, setSlips] = useState<PackingSlipSummary[] | null>(null);
  const [mode, setMode] = useState<"mock" | "live">(props.d365Mode);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  /* ── step 2: form ── */
  const [loadingSlip, setLoadingSlip] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [existing, setExisting] = useState<{ id: string; cmr_number: string | null } | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, ValueSource>>({});
  const [goods, setGoods] = useState<CmrGoodsLine[]>([]);
  const [touched, setTouched] = useState(false);

  /* ── signature ── */
  const [sigMode, setSigMode] = useState<SigMode>("paper");
  const [savedSigs, setSavedSigs] = useState<SavedSignature[]>([]);
  const [savedSigId, setSavedSigId] = useState<string>("");
  const [generatedSig, setGeneratedSig] = useState<string>("");

  /* ── preview / issue ── */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCopy, setPreviewCopy] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ id: string; cmrNumber: string; status: string } | null>(null);
  const lastPreview = useRef<string | null>(null);

  const restricted = !props.allowedCompanies.includes("ALL");

  useEffect(() => {
    api<{ companies: Company[] }>("/api/d365/companies")
      .then((r) => {
        let list = r.companies || [];
        if (restricted) list = list.filter((c) => props.allowedCompanies.includes(c.code.toUpperCase()));
        if (props.preferredCompanies.length) {
          const pref = list.filter((c) => props.preferredCompanies.includes(c.code.toUpperCase()));
          if (pref.length) list = [...pref, ...list.filter((c) => !props.preferredCompanies.includes(c.code.toUpperCase()))];
        }
        setCompanies(list);
        setCompany((cur) => (cur && list.some((c) => c.code.toUpperCase() === cur) ? cur : list[0]?.code.toUpperCase() ?? cur));
      })
      .catch(() => setCompanies(props.allowedCompanies.filter((c) => c !== "ALL").map((c) => ({ code: c, name: c }))));
    api<{ signatures: SavedSignature[] }>("/api/signatures")
      .then((r) => {
        const list = (r.signatures || []).filter((s) => s.dataUrl?.startsWith("data:image/"));
        setSavedSigs(list);
        const def = list.find((s) => s.is_default) ?? list[0];
        if (def) setSavedSigId(def.id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useCallback(async () => {
    if (!company) {
      setSearchError("Choose a legal entity first.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const qs = new URLSearchParams({ company, q: query.trim(), from, to });
      const r = await api<{ mode: "mock" | "live"; slips: PackingSlipSummary[] }>(`/api/d365/packing-slips?${qs}`);
      setSlips(r.slips);
      setMode(r.mode);
    } catch (e) {
      setSlips(null);
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, [company, query, from, to]);

  useEffect(() => {
    if (!company) return;
    const t = setTimeout(() => void search(), 0);
    return () => clearTimeout(t);
    // run once when the company is known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  const openSlip = async (s: PackingSlipSummary) => {
    setLoadingSlip(s.packingSlipId);
    try {
      const qs = new URLSearchParams({ company, salesOrder: s.salesOrder || "" });
      const r = await api<{ prefill: Prefill; existing: { id: string; cmr_number: string | null } | null; template: { name: string } | null }>(
        `/api/d365/packing-slips/${encodeURIComponent(s.packingSlipId)}?${qs}`,
      );
      setPrefill(r.prefill);
      setExisting(r.existing);
      setTemplateName(r.template?.name ?? null);
      setValues({ ...r.prefill.values });
      setSources({ ...r.prefill.sources });
      setGoods(r.prefill.goods.length ? r.prefill.goods.map((g) => ({ ...g })) : [emptyGoodsLine()]);
      setTouched(false);
      setPreviewUrl(null);
      setIssued(null);
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error("Could not load the packing slip", (e as Error).message);
    } finally {
      setLoadingSlip(null);
    }
  };

  const setValue = (k: string, v: string) => {
    setValues((cur) => ({ ...cur, [k]: v }));
    setSources((cur) => ({ ...cur, [k]: "MANUAL" }));
  };
  const setGood = (i: number, k: keyof CmrGoodsLine, v: string) => setGoods((cur) => cur.map((g, j) => (j === i ? { ...g, [k]: v } : g)));

  const totals = useMemo(() => goodsTotals(goods), [goods]);

  const signatureDataUrl = useMemo(() => {
    if (sigMode === "saved") return savedSigs.find((s) => s.id === savedSigId)?.dataUrl ?? undefined;
    if (sigMode === "generate") return generatedSig || undefined;
    return undefined;
  }, [sigMode, savedSigs, savedSigId, generatedSig]);

  const missing = useMemo(() => {
    const m: string[] = REQUIRED_FIELDS.filter((f) => !values[f]?.trim()).map((f) => labelFor(f));
    if (!goods.some((g) => g.nature.trim())) m.push("Goods description (box 9)");
    if (!goods.some((g) => num(g.grossWeight) > 0)) m.push("Gross weight (box 11)");
    if (props.signatureRequired && !signatureDataUrl) m.push("Sender signature (box 22)");
    return m;
  }, [values, goods, signatureDataUrl, props.signatureRequired]);

  const payload = () => ({
    company,
    values: Object.fromEntries(Object.entries(values).filter(([k]) => !/^Goods\d|^Total/.test(k))),
    goods: goods.filter((g) => Object.entries(g).some(([k, v]) => k !== "itemNumber" && String(v ?? "").trim())),
    senderSignature: signatureDataUrl,
  });

  const preview = async (copy = previewCopy) => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/cmr/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), pages: [copy] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? res.statusText);
      }
      const url = URL.createObjectURL(await res.blob());
      if (lastPreview.current) URL.revokeObjectURL(lastPreview.current);
      lastPreview.current = url;
      setPreviewUrl(url);
      setPreviewCopy(copy);
    } catch (e) {
      toast.error("Preview failed", (e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const issue = async () => {
    setTouched(true);
    if (missing.length) {
      toast.error("CMR is incomplete", missing.join(", "));
      return;
    }
    if (!prefill) return;
    setIssuing(true);
    try {
      const r = await api<{ id: string; cmrNumber: string; status: string }>("/api/cmr", {
        method: "POST",
        json: { ...payload(), packingSlipId: prefill.packingSlip.packingSlipId, salesOrder: prefill.packingSlip.salesOrder, sources },
      });
      setIssued(r);
      setStep(3);
      toast.success(`CMR ${r.cmrNumber} issued`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      toast.error("Could not issue the CMR", msg);
    } finally {
      setIssuing(false);
    }
  };

  const reset = () => {
    setStep(1);
    setPrefill(null);
    setIssued(null);
    setPreviewUrl(null);
    void search();
  };

  /* ───────────────────────── render ───────────────────────── */

  return (
    <div className="space-y-5">
      <PageHeader
        title="New CMR consignment note"
        description="Pick a D365 packing slip, check the 24 boxes and issue the 4 copies (sender, consignee, carrier, administrative)."
        crumbs={[{ label: "CMR", href: "/cmr/history" }, { label: "New" }]}
        actions={mode === "mock" ? <Badge tone="warning">DEMO data – D365 in mock mode</Badge> : <Badge tone="success">D365 live</Badge>}
      />

      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <CardHeader title="1 · Packing slip" description="One CMR is issued per posted packing slip. Search by packing slip, sales order, customer account or delivery name." />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(200px,2fr)_150px_150px_auto]">
              <Field label="Legal entity">
                <Select value={company} onChange={(e) => setCompany(e.target.value.toUpperCase())}>
                  {!companies.length && <option value={company}>{company || "Loading…"}</option>}
                  {companies.map((c) => (
                    <option key={c.code} value={c.code.toUpperCase()}>
                      {c.code.toUpperCase()} – {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Search">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void search()}
                  placeholder="Packing slip, sales order, customer…"
                />
              </Field>
              <Field label="Delivery date from">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="to">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button onClick={() => void search()} loading={searching} className="w-full">
                  <Search className="h-4 w-4" /> Search
                </Button>
              </div>
            </div>

            {searchError && <Alert tone="danger" title="D365 search failed">{searchError}</Alert>}

            {searching && !slips && (
              <div className="flex items-center gap-2 py-8 text-sm text-ink-500">
                <Spinner /> Reading packing slips from D365…
              </div>
            )}

            {slips && !slips.length && !searching && (
              <div className="rounded-md border border-dashed border-ink-200 py-10 text-center text-sm text-ink-500">
                No posted packing slips found for {company} in this period.
              </div>
            )}

            {slips && slips.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Packing slip</Th>
                    <Th>Sales order</Th>
                    <Th>Delivery date</Th>
                    <Th>Customer</Th>
                    <Th>Deliver to</Th>
                    <Th>Terms</Th>
                    <Th>CMR</Th>
                    <Th className="text-right"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {slips.map((s) => (
                    <tr key={s.packingSlipId} className="hover:bg-ink-50">
                      <Td className="font-medium">{s.packingSlipId}</Td>
                      <Td>{s.salesOrder}</Td>
                      <Td>{s.deliveryDate}</Td>
                      <Td>{s.customerAccount}</Td>
                      <Td>
                        {s.deliveryName}
                        {s.deliveryCountry ? <span className="text-ink-400"> · {s.deliveryCountry}</span> : null}
                      </Td>
                      <Td>{s.deliveryTerms || "–"}</Td>
                      <Td>
                        {s.cmrId ? (
                          <Link href={`/cmr/${s.cmrId}`} className="text-sky-700 underline">
                            {s.cmrNumber}
                          </Link>
                        ) : (
                          <span className="text-ink-400">–</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {s.cmrId ? (
                          <Link href={`/cmr/${s.cmrId}`}>
                            <Button size="sm" variant="outline">View CMR</Button>
                          </Link>
                        ) : (
                          <Button size="sm" loading={loadingSlip === s.packingSlipId} onClick={() => void openSlip(s)}>
                            Create CMR
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {step === 2 && prefill && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
          <div className="space-y-5">
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-semibold text-ink-900">
                    Packing slip {prefill.packingSlip.packingSlipId} · Sales order {prefill.packingSlip.salesOrder}
                  </div>
                  <div className="text-ink-500">
                    {prefill.packingSlip.company} · {prefill.packingSlip.customerAccount} · {prefill.packingSlip.deliveryName} · delivery {prefill.packingSlip.deliveryDate}
                    {templateName ? ` · layout “${templateName}”` : " · built-in standard CMR layout"}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Other packing slip
                </Button>
              </CardBody>
            </Card>

            {existing && (
              <Alert tone="danger" title={`CMR ${existing.cmr_number ?? ""} already exists for this packing slip`}>
                Only one valid CMR is allowed per packing slip.{" "}
                <Link className="underline" href={`/cmr/${existing.id}`}>
                  Open it
                </Link>{" "}
                and cancel it first if it has to be re-issued.
              </Alert>
            )}

            {prefill.warnings.length > 0 && (
              <Alert tone="warning" title="Check before issuing">
                <ul className="list-disc space-y-0.5 pl-4">
                  {prefill.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2 text-xs text-ink-500">
              <span>Value source:</span>
              <Badge tone="info">D365</Badge>
              <Badge tone="brand">Setting</Badge>
              <Badge tone="neutral">System</Badge>
              <Badge tone="warning">Manual</Badge>
            </div>

            {WIZARD_SECTIONS.slice(0, 5).map((sec) => (
              <Section key={sec.title} title={sec.title} boxes={sec.boxes}>
                {sec.fields.map((f) => (
                  <FormField key={f} field={f} value={values[f] ?? ""} source={sources[f]} invalid={touched && (REQUIRED_FIELDS as readonly string[]).includes(f) && !values[f]?.trim()} onChange={(v) => setValue(f, v)} />
                ))}
              </Section>
            ))}

            <Card>
              <CardHeader
                title="Goods (boxes 6–12)"
                description="Marks & numbers, number of packages, method of packing, nature of goods, statistical number, gross weight (kg), volume (m³). More than 6 lines are printed on a continuation sheet."
                actions={
                  <Button size="sm" variant="outline" onClick={() => setGoods((g) => [...g, emptyGoodsLine()])}>
                    <Plus className="h-4 w-4" /> Line
                  </Button>
                }
              />
              <CardBody className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="px-1 pb-1">6 Marks</th>
                      <th className="px-1 pb-1 w-20">7 Pkgs</th>
                      <th className="px-1 pb-1 w-28">8 Packing</th>
                      <th className="px-1 pb-1">9 Nature of goods</th>
                      <th className="px-1 pb-1 w-28">10 Stat. no.</th>
                      <th className="px-1 pb-1 w-24">11 Gross kg</th>
                      <th className="px-1 pb-1 w-24">12 m³</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {goods.map((g, i) => (
                      <tr key={i} className="align-top">
                        <td className="p-1"><Input value={g.marks} onChange={(e) => setGood(i, "marks", e.target.value)} /></td>
                        <td className="p-1">
                          <Input className={cn(touched && !g.packages && "border-amber-400")} inputMode="numeric" value={g.packages} onChange={(e) => setGood(i, "packages", e.target.value)} />
                        </td>
                        <td className="p-1"><Input value={g.packing} onChange={(e) => setGood(i, "packing", e.target.value)} /></td>
                        <td className="p-1"><Textarea rows={2} value={g.nature} onChange={(e) => setGood(i, "nature", e.target.value)} /></td>
                        <td className="p-1"><Input value={g.statNo} onChange={(e) => setGood(i, "statNo", e.target.value)} /></td>
                        <td className="p-1">
                          <Input className={cn(touched && !(num(g.grossWeight) > 0) && "border-amber-400")} inputMode="decimal" value={g.grossWeight} onChange={(e) => setGood(i, "grossWeight", e.target.value)} />
                        </td>
                        <td className="p-1"><Input inputMode="decimal" value={g.volume} onChange={(e) => setGood(i, "volume", e.target.value)} /></td>
                        <td className="p-1">
                          <Button size="icon" variant="ghost" title="Remove line" onClick={() => setGoods((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [emptyGoodsLine()]))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink-200 font-semibold">
                      <td className="p-1 text-right text-xs uppercase text-ink-500">Total</td>
                      <td className="p-2">{fmt(totals.packages, 0) || "–"}</td>
                      <td colSpan={3} className="p-2 text-xs font-normal text-ink-500">
                        {goods.length > 6 ? `${goods.length} lines – rows 6+ go to the continuation sheet` : ""}
                      </td>
                      <td className="p-2">{fmt(totals.weight) || "–"}</td>
                      <td className="p-2">{fmt(totals.volume, 3) || "–"}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </CardBody>
            </Card>

            {WIZARD_SECTIONS.slice(5).map((sec) => (
              <Section key={sec.title} title={sec.title} boxes={sec.boxes}>
                {sec.fields.map((f) => (
                  <FormField key={f} field={f} value={values[f] ?? ""} source={sources[f]} invalid={touched && (REQUIRED_FIELDS as readonly string[]).includes(f) && !values[f]?.trim()} onChange={(v) => setValue(f, v)} />
                ))}
              </Section>
            ))}

            <Card>
              <CardHeader
                title="Sender's signature (box 22)"
                description="The carrier / driver (box 23) and consignee (box 24) sign the printed copies at loading and delivery."
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["paper", "Sign on paper"],
                      ["saved", `Saved signature${savedSigs.length ? ` (${savedSigs.length})` : ""}`],
                      ["generate", "Generate signature"],
                    ] as const
                  ).map(([k, label]) => (
                    <Button key={k} size="sm" variant={sigMode === k ? "primary" : "outline"} onClick={() => setSigMode(k)} disabled={k === "saved" && !savedSigs.length}>
                      {label}
                    </Button>
                  ))}
                </div>
                {sigMode === "saved" && (
                  <div className="flex flex-wrap gap-3">
                    {savedSigs.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSavedSigId(s.id)}
                        className={cn("rounded-md border bg-white p-2", savedSigId === s.id ? "border-ink-900 ring-2 ring-ink-900/20" : "border-ink-200")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.dataUrl!} alt={s.label} className="h-14 w-44 object-contain" />
                        <div className="mt-1 text-xs text-ink-600">{s.label}</div>
                      </button>
                    ))}
                  </div>
                )}
                {sigMode === "generate" && <SignatureDesigner userName={props.userName} onChange={setGeneratedSig} />}
                {sigMode === "paper" && <p className="text-sm text-ink-500">Box 22 is left empty for a hand signature / company stamp.</p>}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  {missing.length ? (
                    <span className="flex items-center gap-1.5 text-amber-700">
                      <AlertTriangle className="h-4 w-4" /> Missing: {missing.join(", ")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> All mandatory CMR contents are filled.
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void preview()} loading={previewing}>
                    <Eye className="h-4 w-4" /> Preview
                  </Button>
                  <Button onClick={() => void issue()} loading={issuing} disabled={Boolean(existing)}>
                    <Truck className="h-4 w-4" /> Issue CMR
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <Card>
              <CardHeader
                title="Preview (DRAFT)"
                description="No number is reserved until the CMR is issued."
                actions={
                  <Button size="sm" variant="outline" onClick={() => void preview()} loading={previewing}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {CMR_COPIES.map((c) => (
                    <button
                      key={c.no}
                      onClick={() => void preview(c.no)}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs", previewCopy === c.no && previewUrl ? "text-white" : "bg-white text-ink-700")}
                      style={previewCopy === c.no && previewUrl ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
                    >
                      {c.no} · {c.en.replace("Copy for ", "")}
                    </button>
                  ))}
                </div>
                {previewUrl ? (
                  <PdfViewer src={previewUrl} title="CMR preview" downloadName="CMR-preview.pdf" desktopHeight="h-[720px]" />
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-ink-200 text-sm text-ink-500">
                    <FileText className="h-8 w-8 text-ink-300" />
                    <Button variant="outline" size="sm" onClick={() => void preview()} loading={previewing}>
                      Render preview
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {step === 3 && issued && (
        <Card>
          <CardBody className="space-y-4 py-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <div>
              <div className="text-xl font-semibold text-ink-900">CMR {issued.cmrNumber} issued</div>
              <div className="text-sm text-ink-500">
                Packing slip {prefill?.packingSlip.packingSlipId} · 4 copies
                {issued.status === "UPLOAD_FAILED" ? " · PDF storage failed – retry from the CMR page" : ""}
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <a href={`/api/cmr/${issued.id}/pdf`} target="_blank" rel="noreferrer">
                <Button>
                  <FileDown className="h-4 w-4" /> Open PDF (print)
                </Button>
              </a>
              <Link href={`/cmr/${issued.id}`}>
                <Button variant="outline">CMR details</Button>
              </Link>
              <Button variant="outline" onClick={reset}>
                <Plus className="h-4 w-4" /> Next packing slip
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Stepper({ step }: { step: number }) {
  const steps = ["Packing slip", "Check & sign", "Issued"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
              step > i + 1 ? "border-emerald-600 bg-emerald-600 text-white" : step === i + 1 ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 text-ink-500",
            )}
          >
            {i + 1}
          </span>
          <span className={cn(step === i + 1 ? "font-medium text-ink-900" : "text-ink-500")}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-ink-200" />}
        </li>
      ))}
    </ol>
  );
}

function Section({ title, boxes, children }: { title: string; boxes: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={boxes} />
      <CardBody className="grid gap-3 sm:grid-cols-2">{children}</CardBody>
    </Card>
  );
}

function FormField({ field, value, source, invalid, onChange }: { field: string; value: string; source?: ValueSource; invalid?: boolean; onChange: (v: string) => void }) {
  const required = (REQUIRED_FIELDS as readonly string[]).includes(field);
  const label = `${labelFor(field)}${required ? " *" : ""}`;
  const badge = source ? <Badge tone={sourceTone[source]} className="ml-2">{source === "SETTING" ? "Setting" : source === "SYSTEM" ? "System" : source === "MANUAL" ? "Manual" : "D365"}</Badge> : null;

  if (isCheckboxField(field)) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox label={labelFor(field)} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked ? "X" : "")} />
        {badge}
      </div>
    );
  }
  const multiline = isMultilineField(field);
  const isDate = /Date$/.test(field);
  return (
    <div className={cn("space-y-1", multiline && "sm:col-span-2")}>
      <div className="flex items-center text-xs font-medium text-ink-700">
        {label}
        {badge}
      </div>
      {multiline ? (
        <Textarea rows={Math.min(5, Math.max(2, value.split("\n").length))} value={value} onChange={(e) => onChange(e.target.value)} className={cn(invalid && "border-red-400")} />
      ) : (
        <Input type={isDate ? "date" : "text"} value={value} onChange={(e) => onChange(e.target.value)} className={cn(invalid && "border-red-400")} />
      )}
    </div>
  );
}
