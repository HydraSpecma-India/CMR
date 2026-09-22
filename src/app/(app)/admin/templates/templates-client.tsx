"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Copy, Sparkles, Archive, Trash2, PencilRuler, Upload, FileUp, Target, Building2, Tag, ClipboardList } from "lucide-react";
import { Button, Badge, Dialog, Field, Input, Select, Textarea, PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateRow, TemplateVersionSummary } from "@/lib/db/repositories/templates";

type T = TemplateRow & { versions: TemplateVersionSummary[] };

export function TemplatesClient({ templates, templateTypes, canManage, isAdmin = false }: { templates: T[]; templateTypes: string[]; canManage: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadPdfOpen, setUploadPdfOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadRev, setUploadRev] = useState("Rev 01");
  const [uploadCompany, setUploadCompany] = useState("ALL");
  const [uploadItems, setUploadItems] = useState("*");
  const [dupTarget, setDupTarget] = useState<T | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    templateType: templateTypes[0] ?? "CMR",
    applicableCompany: "ALL",
    applicableItems: "*",
  });
  const [dupName, setDupName] = useState("");

  // Edit Applicability Modal state
  const [editApplicabilityTarget, setEditApplicabilityTarget] = useState<T | null>(null);
  const [applicabilityCompany, setApplicabilityCompany] = useState("ALL");
  const [applicabilityItems, setApplicabilityItems] = useState("*");

  async function handleModifyTemplate(templateId: string) {
    setBusy(`edit-${templateId}`);
    try {
      const res = await api<{ ok: boolean; templateId: string; versionId: string }>("/api/templates/ensure-draft", {
        method: "POST",
        json: { templateId },
      });
      if (res.ok && res.templateId && res.versionId) {
        router.push(`/admin/templates/${res.templateId}/designer/${res.versionId}`);
      }
    } catch (e) {
      toast.error("Could not open designer", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadPdf() {
    if (!uploadFile) {
      toast.error("Please select a PDF file");
      return;
    }
    setBusy("upload-pdf");
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("name", uploadName.trim() || uploadFile.name.replace(/\.[^/.]+$/, ""));
      fd.append("description", uploadDesc.trim() || "Created from uploaded PDF");
      fd.append("revision", uploadRev.trim() || "Rev 01");
      fd.append("publish", "true");
      fd.append("applicableCompanies", uploadCompany.trim() || "ALL");
      fd.append("applicableItems", uploadItems.trim() || "*");

      const res = await api<{ ok: boolean; template: { id: string }; version: { id: string } }>("/api/templates/from-pdf", {
        method: "POST",
        body: fd,
      });

      if (res.ok) {
        toast.success("Template created from PDF!");
        setUploadPdfOpen(false);
        setUploadFile(null);
        setUploadName("");
        setUploadDesc("");
        setUploadCompany("ALL");
        setUploadItems("*");
        router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
      }
    } catch (e) {
      toast.error("Failed to create template from PDF", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    try {
      const cos = form.applicableCompany.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const its = form.applicableItems.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await api<{ template: TemplateRow; version: { id: string } }>("/api/templates", {
        method: "POST",
        json: {
          name: form.name,
          description: form.description,
          templateType: form.templateType,
          applicableCompanies: cos.length > 0 ? cos : ["ALL"],
          applicableItems: its.length > 0 ? its : ["*"],
        },
      });
      toast.success("Template created");
      setCreateOpen(false);
      router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
    } catch (e) {
      toast.error("Could not create template", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveApplicability() {
    if (!editApplicabilityTarget) return;
    setBusy("saving-applicability");
    try {
      const cos = applicabilityCompany
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const its = applicabilityItems
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await api(`/api/templates/${editApplicabilityTarget.id}`, {
        method: "PATCH",
        json: {
          applicableCompanies: cos.length > 0 ? cos : ["ALL"],
          applicableItems: its.length > 0 ? its : ["*"],
        },
      });
      toast.success("Template applicability updated successfully");
      setEditApplicabilityTarget(null);
      router.refresh();
    } catch (e) {
      toast.error("Failed to update applicability", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function seed() {
    setBusy("seed");
    try {
      const res = await api<{ template: TemplateRow; version: { id: string } }>("/api/templates/seed", { method: "POST" });
      toast.success("Standard CMR created", "24-box UNECE layout with 4 copies – publish it to use it for new CMRs.");
      router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
    } catch (e) {
      toast.error("Could not create sample", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    if (!dupTarget) return;
    setBusy("dup");
    try {
      await api(`/api/templates/${dupTarget.id}/duplicate`, { method: "POST", json: { name: dupName } });
      toast.success("Template duplicated");
      setDupTarget(null);
      router.refresh();
    } catch (e) {
      toast.error("Could not duplicate", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function archive(t: T) {
    try {
      await api(`/api/templates/${t.id}`, { method: "PATCH", json: { status: t.status === "archived" ? "active" : "archived" } });
      router.refresh();
    } catch (e) {
      toast.error("Could not update", (e as Error).message);
    }
  }

  async function remove(t: T) {
    if (!confirm(`Delete template "${t.name}"? Only possible when nothing was ever published.`)) return;
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" });
      toast.success("Template deleted");
      router.refresh();
    } catch (e) {
      toast.error("Could not delete", (e as Error).message);
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Templates"
        description="Document templates with version control. Only one version per template can be published at a time."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setUploadPdfOpen(true)}>
                <Upload className="h-4 w-4" /> Upload PDF Template
              </Button>
              <Button variant="outline" onClick={seed} loading={busy === "seed"}>
                <Sparkles className="h-4 w-4" /> Create standard CMR
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            </>
          )
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a blank template, or load the HydraSpecma CMR reference document as a ready-made 7-page template."
          action={canManage && <Button onClick={seed} loading={busy === "seed"}><Sparkles className="h-4 w-4" /> Create standard CMR</Button>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Applicability</Th>
              <Th>Published</Th>
              <Th>Versions</Th>
              <Th>Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const active = t.versions.find((v) => v.id === t.active_version_id);
              const isAllCompanies = !t.applicable_companies || t.applicable_companies.length === 0 || t.applicable_companies.includes("ALL");
              const isAllItems = !t.applicable_items || t.applicable_items.length === 0 || t.applicable_items.includes("*");
              return (
                <tr key={t.id} className="hover:bg-ink-50">
                  <Td>
                    <Link href={`/admin/templates/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    {t.status === "archived" && <Badge className="ml-2">Archived</Badge>}
                    {t.description && <div className="text-xs text-ink-500">{t.description}</div>}
                  </Td>
                  <Td>
                    <Badge tone="brand">{t.template_type}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-ink-400 uppercase">Co:</span>
                        {isAllCompanies ? (
                          <Badge tone="neutral" className="text-[10px] px-1.5 py-0.5 font-medium">All Companies</Badge>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {t.applicable_companies!.map((c) => (
                              <Badge key={c} tone="brand" className="text-[10px] px-1.5 py-0.5 font-mono font-semibold">{c}</Badge>
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-ink-400 uppercase">Item:</span>
                        {isAllItems ? (
                          <Badge tone="neutral" className="text-[10px] px-1.5 py-0.5 font-medium">All Items (*)</Badge>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {t.applicable_items!.map((it) => (
                              <Badge key={it} tone="success" className="text-[10px] px-1.5 py-0.5 font-mono font-semibold">{it}</Badge>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>{active ? <Badge tone="success">v{active.version_number} · {active.revision}</Badge> : <span className="text-ink-400">—</span>}</Td>
                  <Td>{t.versions.length}</Td>
                  <Td className="text-ink-500">{new Date(t.updated_at).toLocaleString()}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Configure Company & Item Applicability"
                            onClick={() => {
                              setEditApplicabilityTarget(t);
                              setApplicabilityCompany(t.applicable_companies?.join(", ") || "ALL");
                              setApplicabilityItems(t.applicable_items?.join(", ") || "*");
                            }}
                            className="h-8 text-xs gap-1 text-ink-700 hover:text-ink-900 border-ink-300"
                          >
                            <Target className="h-3.5 w-3.5 text-brand-600" /> Target
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            loading={busy === `edit-${t.id}`}
                            onClick={() => handleModifyTemplate(t.id)}
                            className="h-8 text-xs gap-1"
                          >
                            <PencilRuler className="h-3.5 w-3.5" /> Design
                          </Button>
                          <Link href={`/admin/templates/${t.id}/inputs`}>
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" title="Manual fields for pages 2+ and camera capture">
                              <ClipboardList className="h-3.5 w-3.5 text-brand-600" /> Data fields
                            </Button>
                          </Link>
                        </>
                      )}
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" title="Duplicate" onClick={() => { setDupTarget(t); setDupName(`${t.name} (copy)`); }}><Copy className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <>
                              <Button size="icon" variant="ghost" title={t.status === "archived" ? "Restore" : "Deactivate (archive) – admin only"} onClick={() => archive(t)}><Archive className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" title="Delete – admin only" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New template"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={busy === "create"} disabled={form.name.trim().length < 2}>Create & open designer</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HydraSpecma CMR 1070.0049" autoFocus /></Field>
          <Field label="Template type">
            <Select value={form.templateType} onChange={(e) => setForm({ ...form, templateType: e.target.value })}>
              {templateTypes.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Applicable Company" hint="ALL or comma-separated dataAreaIds">
              <Input
                value={form.applicableCompany}
                onChange={(e) => setForm({ ...form, applicableCompany: e.target.value })}
                placeholder="ALL or HSDK, HSPL"
              />
            </Field>
            <Field label="Applicable Item Number(s)" hint="* or e.g. 1070.0049">
              <Input
                value={form.applicableItems}
                onChange={(e) => setForm({ ...form, applicableItems: e.target.value })}
                placeholder="* or 1070.0049, 1071.0747"
              />
            </Field>
          </div>
          <Field label="Description" hint="(optional)"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(dupTarget)}
        onClose={() => setDupTarget(null)}
        title={`Duplicate "${dupTarget?.name}"`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDupTarget(null)}>Cancel</Button>
            <Button onClick={duplicate} loading={busy === "dup"} disabled={dupName.trim().length < 2}>Duplicate</Button>
          </>
        }
      >
        <Field label="New template name"><Input value={dupName} onChange={(e) => setDupName(e.target.value)} autoFocus /></Field>
        <p className="mt-2 text-xs text-ink-500">The published version (or the latest draft) is copied as version 1 of the new template.</p>
      </Dialog>

      <Dialog
        open={uploadPdfOpen}
        onClose={() => setUploadPdfOpen(false)}
        title="Upload PDF & Create Template"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadPdfOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadPdf} loading={busy === "upload-pdf"} disabled={!uploadFile}>
              <Upload className="h-4 w-4" /> Create & Open Designer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-600">
            Upload your pre-printed CMR form (1 page = used for all 4 copies, 4 pages = one per copy). The standard CMR fields are placed on it; adjust positions in the designer.
          </p>
          <div
            onClick={() => document.getElementById("admin-template-pdf-input")?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-6 text-center hover:bg-brand-50 transition-colors"
          >
            <input
              id="admin-template-pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadFile(f);
                  if (!uploadName) {
                    setUploadName(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
                  }
                }
              }}
            />
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <FileUp className="h-5 w-5" />
            </div>
            {uploadFile ? (
              <div className="mt-3">
                <div className="text-sm font-bold text-ink-900">{uploadFile.name}</div>
                <div className="text-xs text-ink-500 font-mono mt-0.5">
                  {(uploadFile.size / 1024).toFixed(1)} KB &bull; Ready to convert
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-sm font-semibold text-ink-900">Click to select a PDF form file</div>
                <div className="text-xs text-ink-500 mt-1">Accepts standard PDF documents up to 20MB</div>
              </div>
            )}
          </div>

          <Field label="Template Name">
            <Input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. HydraSpecma CMR 1070.0049"
            />
          </Field>

          <Field label="Revision">
            <Input
              value={uploadRev}
              onChange={(e) => setUploadRev(e.target.value)}
              placeholder="Rev 01"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Applicable Company" hint="ALL or comma-separated dataAreaIds">
              <Input
                value={uploadCompany}
                onChange={(e) => setUploadCompany(e.target.value)}
                placeholder="ALL or HSDK, HSPL"
              />
            </Field>
            <Field label="Applicable Item Number(s)" hint="* or e.g. 1070.0049">
              <Input
                value={uploadItems}
                onChange={(e) => setUploadItems(e.target.value)}
                placeholder="* or 1070.0049"
              />
            </Field>
          </div>

          <Field label="Description (Optional)">
            <Textarea
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="e.g. Customer approved CMR layout..."
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(editApplicabilityTarget)}
        onClose={() => setEditApplicabilityTarget(null)}
        title={`Edit Applicability: ${editApplicabilityTarget?.name || ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditApplicabilityTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveApplicability} loading={busy === "saving-applicability"}>
              Save Applicability
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-brand-50/60 p-3 text-xs text-ink-700 border border-brand-200">
            Configure which legal entity (company) and product item numbers will automatically select and use this CMR layout in the New CMR wizard. A company-specific template wins over ALL.
          </div>
          <Field label="Applicable Company / Legal Entity" hint="ALL for any company, or comma-separated dataAreaIds">
            <Input
              value={applicabilityCompany}
              onChange={(e) => setApplicabilityCompany(e.target.value)}
              placeholder="ALL or HSDK, HSPL"
              autoFocus
            />
          </Field>
          <Field label="Applicable Item / Product Number(s)" hint="* for all items, or comma-separated item numbers">
            <Input
              value={applicabilityItems}
              onChange={(e) => setApplicabilityItems(e.target.value)}
              placeholder="* or 1070.0049, 1071.0747"
            />
          </Field>
          <div className="text-xs text-ink-600 space-y-1 bg-ink-50 p-3 rounded-md border border-ink-200">
            <div className="font-semibold text-ink-800">Targeting Rules:</div>
            <div>&bull; <strong className="text-ink-900 font-mono">ALL &bull; *</strong> : General template applicable for all companies and all products.</div>
            <div>&bull; <strong className="text-ink-900 font-mono">HSDK &bull; *</strong> : Used for every CMR of legal entity HSDK instead of the ALL template.</div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
