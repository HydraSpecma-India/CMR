import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { duplicateTemplate } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(await req.json());
  const created = await duplicateTemplate(params.id, name, session.user.id);
  await audit({ entityType: "template", entityId: created.template.id, action: "DUPLICATED", user: session.user, details: { from: params.id, name } });
  return json(created, { status: 201 });
});
