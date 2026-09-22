import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listCompanyNumbering, saveCompanyNumbering } from "@/lib/sequences/cmr-numbers";
import { audit } from "@/lib/audit/audit";

/** Company-wise CMR number sequences (admin). */
export const GET = route(async (req) => {
  await requireCapability("manageSettings");
  const companies = (req.nextUrl.searchParams.get("companies") || "").split(",").map((c) => c.trim()).filter(Boolean);
  return json({ ok: true, companies: await listCompanyNumbering(companies) });
});

const Body = z.object({
  company: z.string().min(2).max(10),
  pattern: z
    .string()
    .max(80)
    .refine((p) => p === "" || /\{seq(?::\d+)?\}/.test(p), "The pattern must contain {seq} or {seq:4}")
    .optional(),
  resetYearly: z.boolean().optional(),
  nextNumber: z.number().int().min(1).max(99_999_999).optional(),
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageSettings");
  const body = Body.parse(await req.json());
  await saveCompanyNumbering(body, session.user.id);
  await audit({ entityType: "settings", entityId: `cmr.numbering.${body.company}`, action: "SETTINGS_CHANGED", user: session.user, details: body });
  return json({ ok: true });
});
