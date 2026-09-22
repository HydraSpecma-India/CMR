import { route, json } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getCmrDocumentById } from "@/lib/db/repositories/cmr";
import { splitSignatures } from "@/lib/cmr/issue";
import { Errors } from "@/lib/errors";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireCapability("viewCmr");
  const found = await getCmrDocumentById(params.id);
  if (!found) throw Errors.notFound("CMR");
  assertCompanyAllowed(session, found.doc.company);
  const { printable, signatures } = splitSignatures(found.doc.form_values_json);
  // raw D365 records are not sent to the browser
  const { d365_context_json: _ctx, form_values_json: _fv, ...doc } = found.doc;
  return json({
    ok: true,
    document: { ...doc, form_values: printable, signed: Object.keys(signatures) },
    steps: found.steps,
  });
});
