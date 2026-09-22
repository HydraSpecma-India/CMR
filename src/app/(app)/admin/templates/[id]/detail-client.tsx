"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PencilRuler, Plus, Rocket, Ban, Trash2, RotateCcw, Eye, ClipboardList } from "lucide-react";
import { Button, Badge, PageHeader, Table, Th, Td, Card, CardHeader, CardBody, Field, Input, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateRow, TemplateVersionSummary } from "@/lib/db/repositories/templates";

type T = TemplateRow & { versions: TemplateVersionSummary[] };

const statusTone = { draft: "info", published: "success", deprecated: "neutral", deleted: "danger" } as const;

export function TemplateDetailClient({ template, canManage, isAdmin = false }: { template: T; canManage: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [meta, setMeta] = useState({ name: template.name, description: template.description ?? "" });

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/templates/${template.id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: "Templates", href: "/admin/templates" }, { label: template.name }]}
        title={template.name}
        description={`${template.template_type} · ${template.versions.length} version(s)`}
        actions={
          <>
            <Link href={`/admin/templates/${template.id}/inputs`}>
              <Button variant="outline">
                <ClipboardList className="h-4 w-4" /> Data entry fields
              </Button>
            </Link>
            {canManage && (
              <Button onClick={() => run("newver", () => api(`${base}/versions`, { method: "POST", json: {} }), "New draft version created")} loading={busy === "newver"}>
                <Plus className="h-4 w-4" /> New version
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Versions" description="Published versions are immutable. To change a published template, create a new version and publish it." />
          <Table className="rounded-none border-0">
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Revision</Th>
                <Th>Status</Th>
                <Th>Note</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {template.versions.map((v) => {
                const vb = `${base}/versions/${v.id}`;
                return (
                  <tr key={v.id}>
                    <Td className="font-medium">v{v.version_number}</Td>
                    <Td>{v.revision ?? "—"}</Td>
                    <Td>
                      <Badge tone={statusTone[v.status]}>{v.status}</Badge>
                      {template.active_version_id === v.id && <Badge tone="success" className="ml-1">Active</Badge>}
                    </Td>
                    <Td className="max-w-xs truncate text-ink-500">{v.change_note ?? ""}</Td>
                    <Td className="text-ink-500">{new Date(v.updated_at).toLocaleString()}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Link href={`/admin/templates/${template.id}/designer/${v.id}`}>
                          <Button size="sm" variant="outline">
                            {v.status === "draft" && canManage ? <><PencilRuler className="h-3.5 w-3.5" /> Design</> : <><Eye className="h-3.5 w-3.5" /> View</>}
                          </Button>
                        </Link>
                        {canManage && v.status === "draft" && (
                          <>
                            <Button size="sm" variant="secondary" loading={busy === `pub-${v.id}`} onClick={() => run(`pub-${v.id}`, () => api(`${vb}/publish`, { method: "POST" }), `Version ${v.version_number} published`)}>
                              <Rocket className="h-3.5 w-3.5" /> Publish
                            </Button>
                            {isAdmin && <Button size="icon" variant="ghost" title="Delete draft (admin only)" onClick={() => run(`del-${v.id}`, () => api(vb, { method: "DELETE" }), "Draft deleted (restorable)")}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>}
                          </>
                        )}
                        {isAdmin && v.status === "published" && (
                          <Button size="sm" variant="outline" loading={busy === `deact-${v.id}`} onClick={() => run(`deact-${v.id}`, () => api(`${vb}/deactivate`, { method: "POST" }), "Version deactivated")}>
                            <Ban className="h-3.5 w-3.5" /> Deactivate
                          </Button>
                        )}
                        {canManage && (v.status === "deprecated" || v.status === "deleted") && (
                          <Button size="sm" variant="ghost" title="Create a new draft from this version" onClick={() => run(`from-${v.id}`, () => api(`${base}/versions`, { method: "POST", json: { fromVersionId: v.id } }), "New draft created from this version")}>
                            <Plus className="h-3.5 w-3.5" /> Draft from this
                          </Button>
                        )}
                        {canManage && v.status === "deleted" && (
                          <Button size="sm" variant="ghost" onClick={() => run(`restore-${v.id}`, () => api(`${vb}/restore`, { method: "POST" }), "Draft restored")}>
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <CardBody className="grid gap-3">
            <Field label="Name"><Input value={meta.name} disabled={!canManage} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={meta.description} disabled={!canManage} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field>
            <Field label="Type"><Input value={template.template_type} disabled /></Field>
            {canManage && (
              <Button variant="outline" loading={busy === "meta"} onClick={() => run("meta", () => api(base, { method: "PATCH", json: meta }), "Details saved")}>
                Save details
              </Button>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
