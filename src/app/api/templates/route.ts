import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { createTemplate, listTemplates } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const GET = route(async () => {
  await requireCapability("viewTemplates");
  const templates = await listTemplates();
  return json({ templates });
});

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  templateType: z.string().trim().min(1).max(60).default("CMR"),
  applicableCompanies: z.array(z.string()).optional(),
  applicableItems: z.array(z.string()).optional(),
});

export const POST = route(async (req) => {
  const session = await requireCapability("manageTemplates");
  const body = CreateSchema.parse(await req.json());
  const created = await createTemplate({ ...body, userId: session.user.id });
  await audit({ entityType: "template", entityId: created.template.id, action: "CREATED", user: session.user, details: { name: body.name, templateType: body.templateType } });
  return json(created, { status: 201 });
});
