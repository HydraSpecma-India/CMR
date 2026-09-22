import { notFound } from "next/navigation";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getCmrDocumentById } from "@/lib/db/repositories/cmr";
import { splitSignatures } from "@/lib/cmr/issue";
import { can } from "@/lib/auth/roles";
import { CmrDetail } from "./detail-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "CMR" };

export default async function CmrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("viewCmr");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getCmrDocumentById(id);
  if (!found) notFound();
  assertCompanyAllowed(session, found.doc.company);
  const { printable, signatures } = splitSignatures(found.doc.form_values_json);
  const { d365_context_json: _ctx, form_values_json: _fv, ...doc } = found.doc;
  return (
    <CmrDetail
      doc={{ ...doc, form_values: printable, signed: Object.keys(signatures) }}
      steps={found.steps}
      canCancel={can(session.user.role, "completeCmr", session.user.capabilities)}
      canRetry={can(session.user.role, "createCmr", session.user.capabilities)}
    />
  );
}
