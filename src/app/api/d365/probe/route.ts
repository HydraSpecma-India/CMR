import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { probeEntities } from "@/lib/integrations/d365/packing-slips";
import { getActiveConfig } from "@/lib/config";

/**
 * GET /api/d365/probe?company= – admin diagnostics: reads one record of every configured entity and
 * lists its property names, so the field mapping can be verified against the real D365 environment.
 */
export const GET = route(async (req) => {
  await requireCapability("manageSettings");
  const cfg = await getActiveConfig();
  const company = (req.nextUrl.searchParams.get("company") || cfg.d365.company || "").trim().toUpperCase();
  if (cfg.d365.mode !== "live") return json({ ok: true, mode: "mock", company, results: [] });
  const results = await probeEntities(company);
  return json({ ok: true, mode: "live", company, results });
});
