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
  Label,
  Table,
  Th,
  Td,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { Plus, Search, Check, X, Edit2, ListTree } from "lucide-react";

const SOURCE_TONES: Record<string, "info" | "brand" | "neutral" | "warning" | "success"> = {
  D365FO: "brand",
  MANUAL: "warning",
  SYSTEM: "neutral",
  STATIC: "neutral",
  SIGNATURE: "info",
  IMAGE: "info",
  CUSTOM: "success",
};

export function FieldsClient({ initialFields }: { initialFields: FieldDefinitionRow[] }) {
  const [fields, setFields] = useState<FieldDefinitionRow[]>(initialFields);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinitionRow | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    field_name: "",
    display_name: "",
    description: "",
    category: "Custom Fields",
    data_type: "TEXT",
    source_type: "MANUAL",
    unit: "",
    default_value: "",
    required: false,
    read_only: false,
  });

  const categories = ["All", ...Array.from(new Set(fields.map((f) => f.category)))];

  const filtered = fields.filter((f) => {
    const matchesQuery =
      f.field_name.toLowerCase().includes(query.toLowerCase()) ||
      f.display_name.toLowerCase().includes(query.toLowerCase()) ||
      f.category.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = selectedCategory === "All" || f.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  const openCreateModal = () => {
    setEditingField(null);
    setFormData({
      field_name: "",
      display_name: "",
      description: "",
      category: "Custom Fields",
      data_type: "TEXT",
      source_type: "MANUAL",
      unit: "",
      default_value: "",
      required: false,
      read_only: false,
    });
    setModalOpen(true);
  };

  const openEditModal = (f: FieldDefinitionRow) => {
    setEditingField(f);
    setFormData({
      field_name: f.field_name,
      display_name: f.display_name,
      description: f.description || "",
      category: f.category,
      data_type: f.data_type,
      source_type: f.source_type,
      unit: f.unit || "",
      default_value: f.default_value || "",
      required: f.required,
      read_only: f.read_only,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingField) {
        // Update
        const res = await api<{ ok: boolean; field: FieldDefinitionRow }>(`/api/fields/${editingField.id}`, {
          method: "PATCH",
          json: {
            display_name: formData.display_name,
            description: formData.description || null,
            category: formData.category,
            data_type: formData.data_type,
            source_type: formData.source_type,
            unit: formData.unit || null,
            default_value: formData.default_value || null,
            required: formData.required,
            read_only: formData.read_only,
          },
        });
        setFields(fields.map((f) => (f.id === editingField.id ? res.field : f)));
        toast.success(`Updated field ${formData.display_name}`);
      } else {
        // Create
        const res = await api<{ ok: boolean; field: FieldDefinitionRow }>("/api/fields", {
          method: "POST",
          json: formData,
        });
        setFields([...fields, res.field]);
        toast.success(`Created field ${formData.field_name}`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error("Error saving field", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (f: FieldDefinitionRow) => {
    try {
      const res = await api<{ ok: boolean; field: FieldDefinitionRow }>(`/api/fields/${f.id}`, {
        method: "PATCH",
        json: { active: !f.active },
      });
      setFields(fields.map((item) => (item.id === f.id ? res.field : item)));
      toast.success(`${f.display_name} marked as ${!f.active ? "active" : "inactive"}`);
    } catch (err) {
      toast.error("Failed to update status", (err as Error).message);
    }
  };

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Field Definitions"
        description="Catalog of dynamic data fields available in the document designer, mapped from D365FO, manual inputs, and system calculations."
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields by name or category..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-ink-900 text-white"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Fields Table */}
      <Table>
        <thead>
          <tr>
            <Th>Field / Display Name</Th>
            <Th>Category</Th>
            <Th>Source</Th>
            <Th>Data Type</Th>
            <Th>Required</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-500">
                No field definitions match your criteria.
              </td>
            </tr>
          ) : (
            filtered.map((f) => (
              <tr key={f.id} className={!f.active ? "opacity-50" : ""}>
                <Td>
                  <div className="font-semibold text-ink-900">{f.display_name}</div>
                  <div className="font-mono text-xs text-ink-500">{f.field_name}</div>
                  {f.description && <div className="text-[11px] text-ink-400 mt-0.5">{f.description}</div>}
                </Td>
                <Td>
                  <span className="text-xs text-ink-600">{f.category}</span>
                </Td>
                <Td>
                  <Badge tone={SOURCE_TONES[f.source_type] || "neutral"}>{f.source_type}</Badge>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{f.data_type}</span>
                  {f.unit && <span className="ml-1 text-xs text-ink-400">({f.unit})</span>}
                </Td>
                <Td>
                  {f.required ? (
                    <Badge tone="danger">Yes</Badge>
                  ) : (
                    <span className="text-xs text-ink-400">No</span>
                  )}
                </Td>
                <Td>
                  <button
                    onClick={() => toggleActive(f)}
                    className="cursor-pointer"
                    title="Click to toggle active status"
                  >
                    <Badge tone={f.active ? "success" : "neutral"}>
                      {f.active ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(f)}>
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {/* Modal Dialog */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingField ? `Edit Field: ${editingField.field_name}` : "Create New Field Definition"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Field Technical Name" hint="Alphanumeric & underscores">
              <Input
                disabled={Boolean(editingField)}
                value={formData.field_name}
                placeholder="e.g. TestPressureBar"
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                required
              />
            </Field>

            <Field label="Display Label" hint="User-friendly name">
              <Input
                value={formData.display_name}
                placeholder="e.g. Test Pressure"
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                required
              />
            </Field>
          </div>

          <Field label="Description" hint="Optional guidance for operators">
            <Input
              value={formData.description}
              placeholder="e.g. Hydraulic proof pressure recorded during test"
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Input
                value={formData.category}
                placeholder="e.g. Sender, Goods, Carrier"
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              />
            </Field>

            <Field label="Unit">
              <Input
                value={formData.unit}
                placeholder="e.g. bar, mm, °C, kg"
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source Type">
              <select
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
              >
                <option value="D365FO">D365FO (ERP Data)</option>
                <option value="MANUAL">MANUAL (Operator Entered)</option>
                <option value="SYSTEM">SYSTEM (Auto-generated)</option>
                <option value="STATIC">STATIC (Fixed Constant)</option>
                <option value="SIGNATURE">SIGNATURE (Digital Signature)</option>
                <option value="CUSTOM">CUSTOM (Formula / Rule)</option>
              </select>
            </Field>

            <Field label="Data Type">
              <select
                value={formData.data_type}
                onChange={(e) => setFormData({ ...formData, data_type: e.target.value })}
                className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
              >
                <option value="TEXT">Text</option>
                <option value="MULTILINE">Multiline Text</option>
                <option value="NUMBER">Number</option>
                <option value="DATE">Date</option>
                <option value="BOOLEAN">Boolean (Yes/No)</option>
                <option value="DROPDOWN">Dropdown</option>
                <option value="SIGNATURE">Signature</option>
              </select>
            </Field>
          </div>

          <div className="flex gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={formData.required}
                onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 accent-ink-900"
              />
              Required Field
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={formData.read_only}
                onChange={(e) => setFormData({ ...formData, read_only: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 accent-ink-900"
              />
              Read-only (Non-editable)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-200">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingField ? "Update Field" : "Create Field"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
