"use client";

import { useState } from "react";
import {
  PageHeader,
  Card,
  CardBody,
  Input,
  Badge,
  Table,
  Th,
  Td,
  Dialog,
  Button,
} from "@/components/ui";
import { Search, Eye, ShieldCheck } from "lucide-react";

interface AuditLogRow {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_email: string | null;
  cmr_number: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function AuditClient({ initialLogs }: { initialLogs: AuditLogRow[] }) {
  const [logs, setLogs] = useState<AuditLogRow[]>(initialLogs);
  const [query, setQuery] = useState("");
  const [activeLog, setActiveLog] = useState<AuditLogRow | null>(null);

  const filtered = logs.filter((l) => {
    const q = query.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.entity_type.toLowerCase().includes(q) ||
      (l.user_email && l.user_email.toLowerCase().includes(q)) ||
      (l.cmr_number && l.cmr_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Audit Trail"
        description="Immutable record of document generations, template revisions, role updates, and system configuration changes."
      />

      <Card className="mb-6">
        <CardBody className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audit trail by user, action, or CMR number..."
              className="pl-9"
            />
          </div>
          <div className="text-xs text-ink-500 font-medium">Total entries: {logs.length}</div>
        </CardBody>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>Timestamp</Th>
            <Th>Action</Th>
            <Th>Entity Type</Th>
            <Th>Target / CMR</Th>
            <Th>User</Th>
            <Th className="text-right">Details</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-500">
                <ShieldCheck className="mx-auto h-8 w-8 text-ink-300 mb-2" />
                No audit events found. Events will record automatically when users generate CMRs or change settings.
              </td>
            </tr>
          ) : (
            filtered.map((log) => (
              <tr key={log.id}>
                <Td>
                  <span className="font-mono text-xs text-ink-600">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </Td>
                <Td>
                  <Badge tone={log.action === "GENERATE" ? "brand" : "neutral"}>
                    {log.action}
                  </Badge>
                </Td>
                <Td>
                  <span className="text-xs font-medium text-ink-800">{log.entity_type}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs font-semibold text-brand-700">
                    {log.cmr_number || log.entity_id?.slice(0, 8) || "—"}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs text-ink-700">{log.user_email || "System"}</span>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setActiveLog(log)}>
                    <Eye className="h-3.5 w-3.5" />
                    Inspect
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Dialog
        open={Boolean(activeLog)}
        onClose={() => setActiveLog(null)}
        title={`Audit Event #${activeLog?.id}: ${activeLog?.action}`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs border-b border-ink-100 pb-3">
            <div><strong>Timestamp:</strong> {activeLog && new Date(activeLog.created_at).toLocaleString()}</div>
            <div><strong>User:</strong> {activeLog?.user_email || "System"}</div>
            <div><strong>Entity:</strong> {activeLog?.entity_type}</div>
            <div><strong>CMR Number:</strong> {activeLog?.cmr_number || "—"}</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-ink-600 mb-1">Payload Details (JSON)</div>
            <pre className="rounded bg-ink-900 p-3 font-mono text-xs text-brand-400 overflow-x-auto max-h-64">
              {JSON.stringify(activeLog?.details || {}, null, 2)}
            </pre>
          </div>

          <div className="flex justify-end pt-3">
            <Button variant="outline" size="sm" onClick={() => setActiveLog(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
