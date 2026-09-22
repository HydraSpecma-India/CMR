import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireAdmin, requireCapability } from "@/lib/auth/guards";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/db/repositories/templates";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  await requireCapability("viewTemplates");
  const template = await getTemplate(params.id);
  if (!template) throw Errors.notFound("Template");
  return json({ template });
});

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  templateType: z.string().trim().min(1).max(60).optional(),
  status: z.enum(["active", "archived"]).optional(),
  applicableCompanies: z.array(z.string()).optional(),
  applicableItems: z.array(z.string()).optional(),
});

export const PATCH = route<P>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const body = PatchSchema.parse(await req.json());
  // Archiving (deactivating) a template is an admin-only action
  if (body.status === "archived") await requireAdmin();
  const template = await updateTemplate(params.id, body, session.user.id);
  await audit({ entityType: "template", entityId: params.id, action: "EDITED", user: session.user, details: body });
  return json({ template });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const session = await requireAdmin();
  await deleteTemplate(params.id);
  await audit({ entityType: "template", entityId: params.id, action: "DELETED", user: session.user });
  return json({ ok: true });
});
