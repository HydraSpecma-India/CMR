import { requireCapability } from "@/lib/auth/guards";
import { CmrHistory } from "./history-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "CMR register" };

export default async function CmrHistoryPage() {
  await requireCapability("viewCmr");
  return <CmrHistory />;
}
