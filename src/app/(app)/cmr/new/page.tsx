import { requireCapability } from "@/lib/auth/guards";
import { getActiveConfig } from "@/lib/config";
import { CmrWizard } from "./cmr-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "New CMR" };

export default async function NewCmrPage({ searchParams }: { searchParams: Promise<{ company?: string; ps?: string }> }) {
  const session = await requireCapability("createCmr");
  const cfg = await getActiveConfig();
  const sp = await searchParams;
  const allowed = session.user.allowedCompanies?.length ? session.user.allowedCompanies : ["ALL"];
  return (
    <CmrWizard
      userName={session.user.name || session.user.email}
      allowedCompanies={allowed.map((c) => c.toUpperCase())}
      preferredCompanies={cfg.cmr.companies.map((c) => c.toUpperCase())}
      defaultCompany={(sp.company || cfg.d365.company || cfg.cmr.companies[0] || "").toUpperCase()}
      initialPackingSlip={sp.ps}
      signatureRequired={cfg.app.signatureRequired}
      d365Mode={cfg.d365.mode}
    />
  );
}
