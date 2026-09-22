import { requireCapability } from "@/lib/auth/guards";
import { listD365Mappings, listFieldDefinitions, type D365MappingRow, type FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { MappingsClient } from "./mappings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "D365FO Field Mapping" };

export default async function D365MappingsPage() {
  await requireCapability("manageFields");
  let mappings: D365MappingRow[] = [];
  let fields: FieldDefinitionRow[] = [];

  try {
    const [m, f] = await Promise.all([
      listD365Mappings(),
      listFieldDefinitions({ includeInactive: false }),
    ]);
    mappings = m;
    fields = f;
  } catch (e) {
    console.error("D365MappingsPage DB error:", e);
  }

  return <MappingsClient initialMappings={mappings} fields={fields} />;
}
