import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getPackingSlipPrefill } from "@/lib/integrations/d365/packing-slips";
import { findActiveCmrForPackingSlip } from "@/lib/db/repositories/cmr";
import { resolveCmrTemplate } from "@/lib/cmr/template-resolve";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

/** GET /api/d365/packing-slips/{packingSlipId}?company=&salesOrder= – CMR prefill for one packing slip. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("createCmr");
  const company = (req.nextUrl.searchParams.get("company") || "").trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,10}$/.test(company)) throw Errors.validation("Choose a legal entity (company).");
  assertCompanyAllowed(session, company);
  const packingSlipId = decodeURIComponent(params.id);

  const prefill = await getPackingSlipPrefill({
    company,
    packingSlipId,
    salesOrder: req.nextUrl.searchParams.get("salesOrder") || undefined,
    userName: session.user.name || session.user.email,
  });
  if (!prefill) throw Errors.notFound(`Packing slip ${packingSlipId} in ${company}`);

  let existing: Awaited<ReturnType<typeof findActiveCmrForPackingSlip>> = null;
  try {
    existing = await findActiveCmrForPackingSlip(company, packingSlipId);
  } catch (e) {
    logger.warn("could not check existing CMR", { error: (e as Error).message });
  }
  const template = await resolveCmrTemplate(company);
  // raw D365 records stay server-side; the wizard only needs the mapped values
  const { context: _context, ...rest } = prefill;
  return json({ ok: true, prefill: rest, existing, template });
});
