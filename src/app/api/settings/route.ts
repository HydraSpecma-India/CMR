import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { getAllSettings, setSetting } from "@/lib/db/repositories/settings";
import { audit } from "@/lib/audit/audit";

export const GET = route(async () => {
  await requireCapability("manageSettings");
  return json({ settings: await getAllSettings() });
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageSettings");
  const body = z.object({ key: z.string().min(1), value: z.unknown() }).parse(await req.json());
  await setSetting(body.key, body.value, session.user.id);
  await audit({ entityType: "settings", entityId: body.key, action: "SETTINGS_CHANGED", user: session.user, details: { value: body.value } });
  return json({ ok: true });
});
