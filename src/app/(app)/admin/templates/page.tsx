import { requireCapability } from "@/lib/auth/guards";
import { listTemplates } from "@/lib/db/repositories/templates";
import { can } from "@/lib/auth/roles";
import { getSetting } from "@/lib/db/repositories/settings";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const session = await requireCapability("viewTemplates");
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let types = ["CMR"];

  try {
    const [t, s] = await Promise.all([
      listTemplates(),
      getSetting<string[]>("template.types", ["CMR"]),
    ]);
    templates = t;
    types = s;
  } catch (e) {
    console.error("TemplatesPage DB error:", e);
  }

  return (
    <TemplatesClient
      templates={templates}
      templateTypes={types}
      canManage={can(session.user.role, "manageTemplates")}
      isAdmin={String(session.user.role).toLowerCase() === "admin"}
    />
  );
}
