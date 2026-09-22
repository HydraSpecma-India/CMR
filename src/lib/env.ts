import "server-only";
import { z } from "zod";

/**
 * Server-side environment contract. Parsed lazily so `next build` does not
 * require every integration variable to be present; individual integrations
 * validate their own subset when first used.
 */
const cleanString = (val: unknown): string | undefined => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const cleanCommentedValue = (val: unknown): string | undefined => {
  const cleaned = cleanString(val);
  if (!cleaned) return undefined;
  const stripped = cleaned.split("#")[0].trim();
  return stripped.length === 0 ? undefined : stripped;
};

const modeSchema = (defaultMode: "mock" | "live" = "mock") =>
  z.preprocess((val) => {
    const cleaned = cleanCommentedValue(val)?.toLowerCase();
    if (cleaned === "mock" || cleaned === "live") return cleaned;
    return defaultMode;
  }, z.enum(["mock", "live"]).default(defaultMode));

const logLevelSchema = z.preprocess((val) => {
  const cleaned = cleanCommentedValue(val)?.toLowerCase();
  if (cleaned === "debug" || cleaned === "info" || cleaned === "warn" || cleaned === "error") {
    return cleaned;
  }
  return "info";
}, z.enum(["debug", "info", "warn", "error"]).default("info"));

const optionalString = z.preprocess((val) => cleanString(val), z.string().optional());

const stringOrDefault = (defaultValue: string, stripComment = false) =>
  z.preprocess((val) => {
    const cleaned = stripComment ? cleanCommentedValue(val) : cleanString(val);
    return cleaned ?? defaultValue;
  }, z.string().default(defaultValue));

const schema = z.object({
  NODE_ENV: z.preprocess((val) => {
    const cleaned = cleanCommentedValue(val)?.toLowerCase();
    if (cleaned === "development" || cleaned === "test" || cleaned === "production") return cleaned;
    return "development";
  }, z.enum(["development", "test", "production"]).default("development")),

  APP_NAME: stringOrDefault("CMR Platform"),
  APP_URL: stringOrDefault("http://localhost:3000", true),

  AUTH_SECRET: optionalString,
  AUTH_MICROSOFT_ENTRA_ID_ID: optionalString,
  AUTH_MICROSOFT_ENTRA_ID_SECRET: optionalString,
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: optionalString,
  ADMIN_EMAILS: stringOrDefault(""),
  AUTH_DEV_BYPASS: z.preprocess(
    (val) => cleanCommentedValue(val)?.toLowerCase() ?? "false",
    z.string().default("false")
  ),

  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  D365_MODE: modeSchema("mock"),
  D365_BASE_URL: optionalString,
  D365_TENANT_ID: optionalString,
  D365_CLIENT_ID: optionalString,
  D365_CLIENT_SECRET: optionalString,
  D365_COMPANY: stringOrDefault(""),
  D365_PACKING_SLIP_HEADER_ENTITY: stringOrDefault("CustPackingSlipJourBiEntities"),
  D365_PACKING_SLIP_LINE_ENTITY: stringOrDefault("CustPackingSlipTransBiEntities"),

  STORAGE_MODE: modeSchema("mock"),
  AZURE_TENANT_ID: optionalString,
  AZURE_CLIENT_ID: optionalString,
  AZURE_CLIENT_SECRET: optionalString,
  SHAREPOINT_SITE_ID: optionalString,
  SHAREPOINT_DRIVE_ID: optionalString,
  SHAREPOINT_ROOT_FOLDER: stringOrDefault("CMR"),

  AUTOMATION_API_KEY: optionalString,
  LOG_LEVEL: logLevelSchema,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
export const devBypassEnabled = () => env().AUTH_DEV_BYPASS === "true" || !env().AUTH_MICROSOFT_ENTRA_ID_ID;
export const adminEmails = () => {
  const list = env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes("manigandan.parthasarathi@hydraspecma.com")) {
    list.push("manigandan.parthasarathi@hydraspecma.com");
  }
  if (!list.includes("mani.sarathy12@gmail.com")) {
    list.push("mani.sarathy12@gmail.com");
  }
  return list;
};

/** Throws a clear error listing the missing variables for an integration. */
export function requireEnv<K extends keyof Env>(keys: K[], integration: string): Pick<Env, K> {
  const e = env();
  const missing = keys.filter((k) => !e[k]);
  if (missing.length) {
    throw new Error(`${integration} is not configured. Missing environment variables: ${missing.join(", ")}`);
  }
  return e;
}
