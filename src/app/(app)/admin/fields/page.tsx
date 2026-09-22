import { requireCapability } from "@/lib/auth/guards";
import { listFieldDefinitions, type FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { FieldsClient } from "./fields-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Field Definitions" };

export default async function FieldsPage() {
  await requireCapability("manageFields");
  let fields: FieldDefinitionRow[] = [];
  try {
    fields = await listFieldDefinitions({ includeInactive: true });
  } catch (e) {
    console.error("FieldsPage DB error:", e);
  }
  return <FieldsClient initialFields={fields} />;
}
