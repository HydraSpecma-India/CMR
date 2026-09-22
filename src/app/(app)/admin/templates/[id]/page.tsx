import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth/guards";
import { getTemplate } from "@/lib/db/repositories/templates";
import { can } from "@/lib/auth/roles";
import { TemplateDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("viewTemplates");
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();
  return (
    <TemplateDetailClient
      template={template}
      canManage={can(session.user.role, "manageTemplates")}
      isAdmin={String(session.user.role).toLowerCase() === "admin"}
    />
  );
}
