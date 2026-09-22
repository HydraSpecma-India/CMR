"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileDown, Plus, Search } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Field, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { api } from "@/lib/utils/fetcher";

export interface CmrListItem {
  id: string;
  cmr_number: string | null;
  company: string;
  packing_slip_id: string;
  sales_order: string | null;
  customer_account: string | null;
  consignee_name: string | null;
  delivery_place: string | null;
  taking_over_date: string | null;
  carrier_name: string | null;
  vehicle_registration: string | null;
  total_packages: number | null;
  total_gross_weight_kg: number | null;
  status: string;
  data_mode: "live" | "mock";
  created_at: string;
}

export const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  UPLOADED: "success",
  COMPLETED: "success",
  PDF_GENERATED: "info",
  DRAFT: "neutral",
  UPLOAD_FAILED: "danger",
  CANCELLED: "warning",
};
export const statusLabel = (s: string) => (s === "UPLOADED" ? "Issued" : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "));

const PAGE = 50;

export function CmrHistory() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<CmrListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ q, status, limit: String(PAGE), offset: String(offset) });
        if (from) qs.set("from", `${from}T00:00:00`);
        if (to) qs.set("to", `${to}T23:59:59`);
        const r = await api<{ documents: CmrListItem[]; hasMore: boolean }>(`/api/cmr?${qs}`);
        setRows((cur) => (offset ? [...cur, ...r.documents] : r.documents));
        setHasMore(r.hasMore);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [q, status, from, to],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(0), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="CMR register"
        description="All issued CMR consignment notes. Cancelled CMRs keep their number; the packing slip can then be re-issued."
        actions={
          <Link href="/cmr/new">
            <Button>
              <Plus className="h-4 w-4" /> New CMR
            </Button>
          </Link>
        }
      />
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_170px_150px_150px_auto]">
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load(0)} placeholder="CMR no., packing slip, order, consignee, carrier, plate…" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="UPLOADED">Issued</option>
              <option value="UPLOAD_FAILED">Upload failed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </Field>
          <Field label="Issued from">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="to">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void load(0)} loading={loading} className="w-full">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && <Alert tone="danger" title="Could not load CMRs">{error}</Alert>}

      {!rows.length && !loading && !error ? (
        <EmptyState title="No CMRs found" description="Issue the first CMR from a D365 packing slip." action={<Link href="/cmr/new"><Button>New CMR</Button></Link>} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>CMR no.</Th>
                <Th>Entity</Th>
                <Th>Packing slip / order</Th>
                <Th>Consignee</Th>
                <Th>Carrier / vehicle</Th>
                <Th>Taking over</Th>
                <Th className="text-right">Pkgs / kg</Th>
                <Th>Status</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50">
                  <Td className="font-medium">
                    <Link href={`/cmr/${r.id}`} className="text-sky-700 hover:underline">
                      {r.cmr_number}
                    </Link>
                    {r.data_mode === "mock" && <Badge tone="warning" className="ml-1.5">DEMO</Badge>}
                  </Td>
                  <Td>{r.company}</Td>
                  <Td>
                    {r.packing_slip_id}
                    <div className="text-xs text-ink-500">{r.sales_order}</div>
                  </Td>
                  <Td>
                    {r.consignee_name}
                    <div className="text-xs text-ink-500">{r.delivery_place}</div>
                  </Td>
                  <Td>
                    {r.carrier_name || "–"}
                    <div className="text-xs text-ink-500">{r.vehicle_registration}</div>
                  </Td>
                  <Td>{r.taking_over_date || "–"}</Td>
                  <Td className="text-right">
                    {r.total_packages ?? "–"} / {r.total_gross_weight_kg ?? "–"}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{statusLabel(r.status)}</Badge>
                  </Td>
                  <Td className="text-right">
                    <a href={`/api/cmr/${r.id}/pdf`} target="_blank" rel="noreferrer" title="Open PDF" className="inline-flex rounded p-1.5 text-ink-600 hover:bg-ink-100">
                      <FileDown className="h-4 w-4" />
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {(hasMore || loading) && (
            <div className="flex justify-center border-t border-ink-100 p-3">
              {loading ? <Spinner /> : <Button variant="outline" size="sm" onClick={() => void load(rows.length)}>Load more</Button>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
