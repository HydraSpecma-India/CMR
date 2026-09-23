import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { getSetting, setSetting } from "@/lib/db/repositories/settings";
import { CustomEntityListSchema, SETTING_KEY, validateCustomEntities } from "@/lib/cmr/custom-entities";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

/** GET /api/d365/custom-entities – admin-defined D365 entities and their relations. */
export const GET = route(async () => {
  await requireCapability("manageFields");
  const raw = await getSetting<unknown>(SETTING_KEY, []);
  const parsed = CustomEntityListSchema.safeParse(raw);
  return json({ ok: true, entities: parsed.success ? parsed.data : [] });
});

/** PUT /api/d365/custom-entities – replaces the whole list (order matters: parents first). */
export const PUT = route(async (req) => {
  const session = await requireCapability("manageFields");
  const body = z.object({ entities: CustomEntityListSchema }).parse(await req.json());
  const errors = validateCustomEntities(body.entities);
  if (errors.length) throw Errors.validation(errors.join(" "), { errors });
  await setSetting(SETTING_KEY, body.entities, session.user.id);
  await audit({
    entityType: "settings",
    action: "SETTINGS_CHANGED",
    user: session.user,
    details: { key: SETTING_KEY, entities: body.entities.map((e) => `${e.key}=${e.entity}`) },
  });
  return json({ ok: true, entities: body.entities });
});
