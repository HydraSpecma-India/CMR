import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { deleteD365Mapping, listD365Mappings, upsertD365Mapping } from "@/lib/db/repositories/fields";
import { audit } from "@/lib/audit/audit";
import { z } from "zod";

const mappingSchema = z.object({
  id: z.string().uuid().optional(),
  field_id: z.string().uuid("Invalid field_id UUID"),
  entity: z.string().trim().min(1, "Choose the D365 record"),
  property: z.string().trim().min(1, "Property name is required").max(120),
  path: z.string().trim().max(200).optional(),
  odata_type: z.string().optional(),
  transform: z.string().default("none"),
  active: z.boolean().default(true),
});

export const GET = route(async () => {
  await requireCapability("manageFields");
  const mappings = await listD365Mappings(true);
  return json({ mappings });
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageFields");
  const parsed = mappingSchema.parse(await req.json());
  const result = await upsertD365Mapping(parsed);
  await audit({ entityType: "field_definition", entityId: parsed.field_id, action: "EDITED", user: session.user, details: { d365Mapping: { entity: parsed.entity, property: parsed.property, transform: parsed.transform, active: parsed.active } } });
  return json({ ok: true, mapping: result });
});

export const DELETE = route(async (req) => {
  const session = await requireCapability("manageFields");
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
  await deleteD365Mapping(id);
  await audit({ entityType: "field_definition", entityId: id, action: "DELETED", user: session.user, details: { d365Mapping: id } });
  return json({ ok: true });
});
