"use client";

import { useState } from "react";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Input,
  Badge,
  Dialog,
  Field,
  Table,
  Th,
  Td,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { D365MappingRow, FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { Plus, Edit2, Link2 } from "lucide-react";

export function MappingsClient({
  initialMappings,
  fields,
}: {
  initialMappings: D365MappingRow[];
  fields: FieldDefinitionRow[];
}) {
  const [mappings, setMappings] = useState<D365MappingRow[]>(initialMappings);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingMapping, setEditingMapping] = useState<D365MappingRow | null>(null);

  const [formData, setFormData] = useState({
    field_id: fields[0]?.id || "",
    entity: "CMRProductionDatas",
    property: "",
    path: "",
    transform: "none",
  });

  const openCreateModal = () => {
    setEditingMapping(null);
    setFormData({
      field_id: fields[0]?.id || "",
      entity: "CMRProductionDatas",
      property: "",
      path: "",
      transform: "none",
    });
    setModalOpen(true);
  };

  const openEditModal = (m: D365MappingRow) => {
    setEditingMapping(m);
    setFormData({
      field_id: m.field_id,
      entity: m.entity,
      property: m.property,
      path: m.path || "",
      transform: m.transform || "none",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; mapping: D365MappingRow }>("/api/d365-mappings", {
        method: "PUT",
        json: {
          id: editingMapping?.id,
          ...formData,
        },
      });

      if (editingMapping) {
        setMappings(mappings.map((m) => (m.id === editingMapping.id ? res.mapping : m)));
        toast.success("Mapping updated successfully");
      } else {
        setMappings([...mappings, res.mapping]);
        toast.success("New mapping created");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error("Failed to save mapping", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="D365FO Field Mappings"
        description="Bind document template fields directly to Dynamics 365 Finance & Operations OData entities and properties."
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4" />
            Add Mapping
          </Button>
        }
      />

      <Card className="mb-6">
        <CardBody className="text-sm text-ink-600">
          When creating a CMR consignment note from a packing slip, the system queries the D365FO OData entity 
          <span className="mx-1 font-mono font-semibold text-ink-900">CMRProductionDatas</span> and automatically maps ERP fields to your document layout.
        </CardBody>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>Template Field</Th>
            <Th>D365 Entity</Th>
            <Th>OData Property / Path</Th>
            <Th>Transform</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => {
            const field = m.field || fields.find((f) => f.id === m.field_id);
            return (
              <tr key={m.id}>
                <Td>
                  <div className="font-semibold text-ink-900">{field?.display_name || "Unknown Field"}</div>
                  <div className="font-mono text-xs text-ink-500">{field?.field_name || m.field_id}</div>
                </Td>
                <Td>
                  <Badge tone="brand">{m.entity}</Badge>
                </Td>
                <Td>
                  <span className="font-mono text-xs font-semibold text-ink-800">{m.property}</span>
                  {m.path && <span className="ml-1 text-xs text-ink-500">({m.path})</span>}
                </Td>
                <Td>
                  <span className="font-mono text-xs text-ink-600">{m.transform}</span>
                </Td>
                <Td>
                  <Badge tone={m.active ? "success" : "neutral"}>
                    {m.active ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(m)}>
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMapping ? "Edit D365FO Field Mapping" : "Create D365FO Field Mapping"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Template Field">
            <select
              value={formData.field_id}
              onChange={(e) => setFormData({ ...formData, field_id: e.target.value })}
              className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.display_name} ({f.field_name})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="D365 Entity">
              <Input
                value={formData.entity}
                placeholder="CMRProductionDatas"
                onChange={(e) => setFormData({ ...formData, entity: e.target.value })}
                required
              />
            </Field>

            <Field label="OData Property">
              <Input
                value={formData.property}
                placeholder="e.g. ItemNumber"
                onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                required
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nested Property Path" hint="Optional">
              <Input
                value={formData.path}
                placeholder="e.g. DeliveryAddressCity"
                onChange={(e) => setFormData({ ...formData, path: e.target.value })}
              />
            </Field>

            <Field label="Transform Rule">
              <select
                value={formData.transform}
                onChange={(e) => setFormData({ ...formData, transform: e.target.value })}
                className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
              >
                <option value="none">None (Raw Value)</option>
                <option value="uppercase">Uppercase</option>
                <option value="trim">Trim Whitespace</option>
                <option value="date_iso">Date (YYYY-MM-DD)</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-200">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingMapping ? "Update Mapping" : "Create Mapping"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
