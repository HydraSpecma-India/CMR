import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { CustomEntityListSchema, validateCustomEntities } from "@/lib/cmr/custom-entities";
import { loadPackingSlipRecords } from "@/lib/integrations/d365/packing-slips";
import { resolveCustomEntities } from "@/lib/integrations/d365/custom-entities";
import { getActiveConfig } from "@/lib/config";
import { Errors } from "@/lib/errors";

const Body = z.object({
  company: z.string().trim().min(1).max(10),
  packingSlipId: z.string().trim().min(1).max(40),
  /** the (possibly unsaved) list; the entity to test and everything above it are resolved */
  entities: CustomEntityListSchema,
  key: z.string(),
});

const preview = (row: Record<string, unknown> | null) =>
  row
    ? Object.fromEntries(
        Object.entries(row)
          .filter(([k]) => !k.startsWith("@"))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v).slice(0, 120)]),
      )
    : null;

/** POST /api/d365/custom-entities/test – runs the relations against one real packing slip. */
export const POST = route(async (req) => {
  const session = await requireCapability("manageFields");
  const body = Body.parse(await req.json());
  const company = body.company.toUpperCase();
  assertCompanyAllowed(session, company);
  const errors = validateCustomEntities(body.entities);
  if (errors.length) throw Errors.validation(errors.join(" "), { errors });
  const idx = body.entities.findIndex((e) => e.key === body.key);
  if (idx < 0) throw Errors.notFound("Custom entity");

  const { live, src } = await loadPackingSlipRecords(company, body.packingSlipId);
  if (!live) throw Errors.validation("D365 is in mock mode – custom entities can only be tested against live D365.");
  if (!src) throw Errors.notFound(`Packing slip ${body.packingSlipId} in ${company}`);

  const cfg = await getActiveConfig();
  const defs = body.entities.slice(0, idx + 1).map((e) => ({ ...e, active: true }));
  const res = await resolveCustomEntities(cfg.d365, company, src, defs);
  const key = body.key;
  const perLine = key in res.perLine;
  return json({
    ok: true,
    perLine,
    lines: src.lines.length,
    trace: res.trace[key] ?? [],
    records: perLine ? res.perLine[key].slice(0, 5).map(preview) : [preview(res.header[key] ?? null)],
  });
});
