import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getCmrDocumentById } from "@/lib/db/repositories/cmr";
import { renderAndStore } from "@/lib/cmr/issue";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

/** POST /api/cmr/{id}/retry – re-renders and re-uploads a CMR whose PDF was not stored. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireCapability("createCmr");
  const found = await getCmrDocumentById(params.id);
  if (!found) throw Errors.notFound("CMR");
  assertCompanyAllowed(session, found.doc.company);
  if (!["DRAFT", "PDF_GENERATED", "UPLOAD_FAILED"].includes(found.doc.status)) {
    throw Errors.conflict(`Nothing to retry – the CMR is ${found.doc.status.toLowerCase().replace("_", " ")}.`);
  }
  const res = await renderAndStore(found.doc, { issuedBy: session.user.name || session.user.email, notifyTeams: false });
  await audit({
    entityType: "cmr_document",
    entityId: params.id,
    action: "RETRIED",
    user: { id: session.user.id, email: session.user.email },
    cmrNumber: found.doc.cmr_number ?? undefined,
    details: { status: res.status },
  });
  return json({ ok: true, status: res.status });
});
