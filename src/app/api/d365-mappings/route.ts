import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { listD365Mappings, upsertD365Mapping } from "@/lib/db/repositories/fields";
import { z } from "zod";

const mappingSchema = z.object({
  id: z.string().optional(),
  field_id: z.string().uuid("Invalid field_id UUID"),
  entity: z.string().min(1, "Entity name is required"),
  property: z.string().min(1, "Property name is required"),
  path: z.string().optional(),
  odata_type: z.string().optional(),
  transform: z.string().default("none"),
  active: z.boolean().default(true),
});

export const GET = route(async () => {
  const session = await requireSession();
  requireRole(session, ["Admin"]);
  const mappings = await listD365Mappings();
  return json({ mappings });
});

export const PUT = route(async (req) => {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const body = await req.json();
  const parsed = mappingSchema.parse(body);
  const result = await upsertD365Mapping(parsed);
  return json({ ok: true, mapping: result });
});
