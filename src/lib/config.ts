import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { env } from "@/lib/env";

export interface IntegrationConfig {
  entra: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    issuer: string;
    adminEmails: string;
    devBypass: boolean;
  };
  d365: {
    /** "coc" = use the D365 connection (URL, tenant, app registration, mode) configured in the COC app */
    connectionSource: "coc" | "own";
    mode: "mock" | "live";
    baseUrl: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    company: string;
    packingSlipHeaderEntity: string;
    packingSlipLineEntity: string;
    salesOrderEntity: string;
    customerEntity: string;
    legalEntityEntity: string;
    warehouseEntity: string;
    productEntity: string;
    carrierEntity: string;
    invoiceEntity: string;
  };
  sharepoint: {
    mode: "mock" | "live";
    tenantId: string;
    clientId: string;
    clientSecret: string;
    siteId: string;
    driveId: string;
    rootFolder: string;
  };
  app: {
    name: string;
    url: string;
    automationApiKey: string;
    logLevel: "debug" | "info" | "warn" | "error";
    numberFormat: string;
    numberAuthority: "app" | "d365";
    oneCmrPerPackingSlip: boolean;
    signatureRequired: boolean;
    /** Where the browser goes after sign-out / session timeout (absolute or relative). */
    loginRedirectUrl: string;
    /** Inactivity timeout in minutes (5–480). */
    sessionTimeoutMinutes: number;
  };
  cmr: CmrDefaults;
  teams: {
    enabled: boolean;
    webhookUrl: string;
    companyWebhooks: Record<string, string>;
  };
}

/** Admin-editable CMR defaults (setting key "cmr.defaults"). */
export interface CmrDefaults {
  /** Incoterms that mean the consignee pays the carriage → "Carriage forward" is ticked; any other term → "Carriage paid". */
  forwardIncoterms: string[];
  defaultPacking: string;
  /** Box 6 default. Tokens: {CustomerRef} {SalesOrder} {PackingSlip} {ItemNumber} */
  marksPattern: string;
  senderInstructions: string;
  specialAgreements: string;
  toBePaidBy: string;
  /** Box 21 place; empty = sender's city from D365 */
  establishedPlace: string;
  /** Companies (dataAreaId) that issue CMRs; empty = all */
  companies: string[];
  /** Form language per company, e.g. { "HSDK": "da" }; otherwise derived from the sender's country */
  languageByCompany: Record<string, string>;
}

export const DEFAULT_CMR_DEFAULTS: CmrDefaults = {
  forwardIncoterms: ["EXW", "FCA", "FAS", "FOB"],
  defaultPacking: "Pallet",
  marksPattern: "{CustomerRef}",
  senderInstructions: "",
  specialAgreements: "",
  toBePaidBy: "",
  establishedPlace: "",
  companies: [],
  languageByCompany: {},
};

export const DEFAULT_TEAMS_WEBHOOK_URL = "";

let cachedSettings: Record<string, unknown> | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 60_000; // 60s cache to avoid repetitive DB calls

export async function fetchAllDbSettings(force = false): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (!force && cachedSettings && now - lastFetch < CACHE_TTL_MS) {
    return cachedSettings;
  }
  try {
    const { data, error } = await supabaseAdmin().from("cmr_app_settings").select("key, value");
    if (error) {
      console.warn("Failed to fetch settings from DB, falling back to env:", error.message);
      return cachedSettings || {};
    }
    const map: Record<string, unknown> = {};
    for (const row of data || []) {
      map[row.key] = row.value;
    }
    // D365 connection of the COC app (same Supabase project, server-side only) → "coc:<key>"
    try {
      const { data: coc } = await supabaseAdmin().from("coc_app_settings").select("key, value").in("key", COC_D365_KEYS);
      for (const row of coc || []) map[`coc:${row.key}`] = row.value;
    } catch {
      /* COC tables not present – own connection is used */
    }
    cachedSettings = map;
    lastFetch = now;
    return map;
  } catch (err) {
    console.warn("Exception fetching settings from DB:", err);
    return cachedSettings || {};
  }
}

const COC_D365_KEYS = ["d365.mode", "d365.baseUrl", "d365.tenantId", "d365.clientId", "d365.clientSecret"];

export function invalidateConfigCache() {
  cachedSettings = null;
  lastFetch = 0;
}

/**
 * Returns merged configuration: Supabase DB values take priority,
 * falling back to process.env variables.
 */
export async function getActiveConfig(): Promise<IntegrationConfig> {
  const db = await fetchAllDbSettings();
  const e = env();

  const str = (key: string, fallback?: string): string => {
    const val = db[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
    return fallback ?? "";
  };

  const bool = (key: string, fallback = false): boolean => {
    const val = db[key];
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true";
    return fallback;
  };

  const mode = (key: string, fallback: "mock" | "live"): "mock" | "live" => {
    const val = db[key];
    if (val === "mock" || val === "live") return val;
    return fallback;
  };

  // D365 connection: shared with the COC app by default, CMR-specific only when switched to "own"
  const d365Source: "coc" | "own" = str("d365.connectionSource", process.env.D365_CONNECTION_SOURCE || "coc") === "own" ? "own" : "coc";
  const d365Conn = (key: string, fallback?: string): string => {
    if (d365Source === "coc") {
      const v = db[`coc:${key}`];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return str(key, fallback);
  };

  const entraTenant = str("auth.entra.tenantId", "");
  const entraIssuer = str(
    "auth.entra.issuer",
    e.AUTH_MICROSOFT_ENTRA_ID_ISSUER || (entraTenant ? `https://login.microsoftonline.com/${entraTenant}/v2.0` : "")
  );

  return {
    entra: {
      clientId: str("auth.entra.clientId", e.AUTH_MICROSOFT_ENTRA_ID_ID),
      clientSecret: str("auth.entra.clientSecret", e.AUTH_MICROSOFT_ENTRA_ID_SECRET),
      tenantId: entraTenant,
      issuer: entraIssuer,
      adminEmails: str("auth.adminEmails", e.ADMIN_EMAILS),
      devBypass: bool("auth.devBypass", e.AUTH_DEV_BYPASS === "true"),
    },
    d365: {
      connectionSource: d365Source,
      mode: d365Source === "coc" && (db["coc:d365.mode"] === "live" || db["coc:d365.mode"] === "mock") ? (db["coc:d365.mode"] as "mock" | "live") : mode("d365.mode", e.D365_MODE),
      baseUrl: d365Conn("d365.baseUrl", e.D365_BASE_URL),
      tenantId: d365Conn("d365.tenantId", e.D365_TENANT_ID),
      clientId: d365Conn("d365.clientId", e.D365_CLIENT_ID),
      // the COC app keeps its secret in the server environment (D365_CLIENT_SECRET) – set the same value here
      clientSecret: d365Conn("d365.clientSecret", e.D365_CLIENT_SECRET),
      company: str("d365.company", e.D365_COMPANY),
      packingSlipHeaderEntity: str("d365.packingSlipHeaderEntity", e.D365_PACKING_SLIP_HEADER_ENTITY),
      packingSlipLineEntity: str("d365.packingSlipLineEntity", e.D365_PACKING_SLIP_LINE_ENTITY),
      salesOrderEntity: str("d365.salesOrderEntity", "SalesOrderHeadersV2"),
      customerEntity: str("d365.customerEntity", "CustomersV3"),
      legalEntityEntity: str("d365.legalEntityEntity", "LegalEntities"),
      warehouseEntity: str("d365.warehouseEntity", "Warehouses"),
      productEntity: str("d365.productEntity", "ReleasedProductsV2"),
      carrierEntity: str("d365.carrierEntity", "ShippingCarriers"),
      invoiceEntity: str("d365.invoiceEntity", "SalesInvoiceHeadersV2"),
    },
    sharepoint: {
      mode: mode("sharepoint.mode", e.STORAGE_MODE),
      tenantId: str("sharepoint.tenantId", e.AZURE_TENANT_ID),
      clientId: str("sharepoint.clientId", e.AZURE_CLIENT_ID),
      clientSecret: str("sharepoint.clientSecret", e.AZURE_CLIENT_SECRET),
      siteId: str("sharepoint.siteId", e.SHAREPOINT_SITE_ID),
      driveId: str("sharepoint.driveId", e.SHAREPOINT_DRIVE_ID),
      rootFolder: str("sharepoint.rootFolder", e.SHAREPOINT_ROOT_FOLDER),
    },
    app: {
      name: str("app.name", e.APP_NAME),
      url: str("app.url", e.APP_URL),
      automationApiKey: str("app.automationApiKey", e.AUTOMATION_API_KEY),
      logLevel: (str("app.logLevel", e.LOG_LEVEL) as "debug" | "info" | "warn" | "error") || "info",
      numberFormat: str("cmr.numberFormat", "CMR-{yyyy}-{seq:4}"),
      numberAuthority: (str("cmr.numberAuthority", "app") as "app" | "d365") || "app",
      oneCmrPerPackingSlip: bool("cmr.oneCmrPerPackingSlip", true),
      signatureRequired: bool("signature.required", false),
      loginRedirectUrl: str("auth.loginRedirectUrl", ""),
      sessionTimeoutMinutes: (() => {
        const n = Number(db["auth.sessionTimeoutMinutes"]);
        return Number.isFinite(n) && n >= 5 && n <= 480 ? Math.round(n) : 30;
      })(),
    },
    cmr: (() => {
      const raw = db["cmr.defaults"];
      const v = raw && typeof raw === "object" ? (raw as Partial<CmrDefaults>) : {};
      return { ...DEFAULT_CMR_DEFAULTS, ...v };
    })(),
    teams: {
      // CMR notifications are opt-in: the admin sets a dedicated webhook for the logistics channel.
      enabled: bool("teams.enabled", false),
      webhookUrl: str("teams.webhookUrl", process.env.TEAMS_WEBHOOK_URL || DEFAULT_TEAMS_WEBHOOK_URL),
      companyWebhooks:
        typeof db["teams.companyWebhooks"] === "object" && db["teams.companyWebhooks"] !== null
          ? (db["teams.companyWebhooks"] as Record<string, string>)
          : {},
    },
  };
}
