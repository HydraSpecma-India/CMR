import { requireCapability } from "@/lib/auth/guards";
import { listD365Mappings, listFieldDefinitions, type D365MappingRow, type FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { getActiveConfig } from "@/lib/config";
import { MAPPING_SOURCES } from "@/lib/cmr/mapping-sources";
import { MappingsClient } from "./mappings-client";
import { loadCustomEntityDefs } from "@/lib/integrations/d365/custom-entities";

export const dynamic = "force-dynamic";
export const metadata = { title: "D365FO Field Mapping" };

export default async function D365MappingsPage() {
  await requireCapability("manageFields");
  let mappings: D365MappingRow[] = [];
  let fields: FieldDefinitionRow[] = [];
  let dbError: string | null = null;
  try {
    [mappings, fields] = await Promise.all([listD365Mappings(true), listFieldDefinitions({ includeInactive: false, force: true })]);
  } catch (e) {
    dbError = (e as Error).message;
  }
  const cfg = await getActiveConfig();
  const entityNames = Object.fromEntries(MAPPING_SOURCES.map((s) => [s.key, cfg.d365[s.configKey]]));
  const company = (cfg.d365.company || cfg.cmr.companies[0] || "").toUpperCase();
  const customEntities = await loadCustomEntityDefs();
  return (
    <MappingsClient
      initialMappings={mappings}
      fields={fields}
      entityNames={entityNames}
      live={cfg.d365.mode === "live"}
      defaultCompany={company}
      dbError={dbError}
      initialCustomEntities={customEntities}
    />
  );
}
