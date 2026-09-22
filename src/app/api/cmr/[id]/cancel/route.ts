import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getCmrDocumentById, logProcessStep, updateCmrDocument } from "@/lib/db/repositories/cmr";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

const Schema = z.object({ reason: z.string().trim().min(3, "Give a reason for the cancellation").max(500) });

/** POST /api/cmr/{id}/cancel – voids the CMR (number is kept, packing slip can be re-issued). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("completeCmr");
  const { reason } = Schema.parse(await req.json());
  const found = await getCmrDocumentById(params.id);
  if (!found) throw Errors.notFound("CMR");
  assertCompanyAllowed(session, found.doc.company);
  if (found.doc.status === "CANCELLED") throw Errors.conflict("This CMR is already cancelled.");

  const uid = /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : null;
  await updateCmrDocument(params.id, { status: "CANCELLED", cancel_reason: reason, cancelled_by: uid, cancelled_at: new Date().toISOString() });
  await logProcessStep(params.id, "CANCEL", "OK", { reason, by: session.user.email });
  await audit({
    entityType: "cmr_document",
    entityId: params.id,
    action: "CANCELLED",
    user: { id: session.user.id, email: session.user.email },
    cmrNumber: found.doc.cmr_number ?? undefined,
    details: { reason, packingSlip: found.doc.packing_slip_id },
  });
  return json({ ok: true });
});
