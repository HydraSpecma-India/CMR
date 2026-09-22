import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { searchPackingSlips } from "@/lib/integrations/d365/packing-slips";
import { mapCmrsForPackingSlips } from "@/lib/db/repositories/cmr";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

const isoDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** GET /api/d365/packing-slips?company=&q=&from=&to= – packing slips of one legal entity, badged with existing CMRs. */
export const GET = route(async (req) => {
  const session = await requireCapability("createCmr");
  const sp = req.nextUrl.searchParams;
  const company = (sp.get("company") || "").trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,10}$/.test(company)) throw Errors.validation("Choose a legal entity (company).");
  assertCompanyAllowed(session, company);

  const { mode, slips } = await searchPackingSlips({
    company,
    query: (sp.get("q") || "").slice(0, 60),
    from: isoDay(sp.get("from")),
    to: isoDay(sp.get("to")),
    limit: 100,
  });

  try {
    const existing = await mapCmrsForPackingSlips(company, slips.map((s) => s.packingSlipId));
    for (const s of slips) {
      const e = existing.get(s.packingSlipId);
      if (e) {
        s.cmrId = e.id;
        s.cmrNumber = e.cmr_number;
      }
    }
  } catch (e) {
    logger.warn("could not check existing CMRs", { error: (e as Error).message });
  }
  return json({ ok: true, mode, slips });
});
