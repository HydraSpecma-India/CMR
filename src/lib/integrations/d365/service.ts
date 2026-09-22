import "server-only";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedD365Token: CachedToken | null = null;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
let cachedCompaniesList: CacheEntry<{ code: string; name: string }[]> | null = null;

export type D365Config = Awaited<ReturnType<typeof getActiveConfig>>["d365"];

/** Shared D365 F&O access: OAuth client-credentials token + legal entities. */
export class D365Service {
  static clearCaches() {
    cachedD365Token = null;
    cachedCompaniesList = null;
  }

  static async getAccessToken(config: Awaited<ReturnType<typeof getActiveConfig>>["d365"]): Promise<string> {
    if (!config.tenantId || !config.clientId || !config.clientSecret || !config.baseUrl) {
      throw new Error("D365 credentials incomplete (missing tenantId, clientId, clientSecret, or baseUrl)");
    }

    const now = Date.now();
    if (cachedD365Token && now < cachedD365Token.expiresAt) {
      return cachedD365Token.token;
    }

    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: `${config.baseUrl.replace(/\/+$/, "")}/.default`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`D365 Auth Failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
    // Buffer of 120 seconds before actual token expiration
    cachedD365Token = {
      token: data.access_token,
      expiresAt: now + Math.max(60, expiresInSec - 120) * 1000,
    };
    return data.access_token;
  }

  static async getCompanies(): Promise<{ code: string; name: string }[]> {
    const now = Date.now();
    if (cachedCompaniesList && now < cachedCompaniesList.expiresAt) {
      return cachedCompaniesList.data;
    }

    const config = (await getActiveConfig()).d365;

    const defaultCompanies: { code: string; name: string }[] = [
      { code: "HSIN", name: "HydraSpecma India (India)" },
      { code: "HGCN", name: "HydraSpecma China (China)" },
      { code: "HSDK", name: "HydraSpecma Denmark (Denmark)" },
      { code: "HSPL", name: "HydraSpecma Poland (Poland)" },
      { code: "HSSE", name: "HydraSpecma Sweden (Sweden)" },
      { code: "HSFI", name: "HydraSpecma Finland (Finland)" },
      { code: "HSUK", name: "HydraSpecma UK (United Kingdom)" },
      { code: "HSUS", name: "HydraSpecma North America (USA)" },
      { code: "HSBR", name: "HydraSpecma Brazil (Brazil)" },
    ];

    if (config.mode === "mock" || !config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
      const list = [{ code: "DEMO", name: "DEMO company (mock data)" }, ...defaultCompanies];
      cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
      return list;
    }

    try {
      const token = await this.getAccessToken(config);
      const baseUrl = config.baseUrl.replace(/\/+$/, "");

      // 1. Try D365 LegalEntities
      try {
        const res = await fetch(`${baseUrl}/data/LegalEntities?$select=LegalEntityId,Name&$top=100`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const list = json.value
              .map((item: Record<string, unknown>) => ({
                code: String(item.LegalEntityId || item.DataArea || "").toUpperCase(),
                name: String(item.Name || item.LegalEntityId || ""),
              }))
              .filter((c: { code: string }) => c.code);
            if (list.length > 0) {
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      // 2. Try D365 DataAreas
      try {
        const res = await fetch(`${baseUrl}/data/DataAreas?$select=id,name&$top=100`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const list = json.value
              .map((item: Record<string, unknown>) => ({
                code: String(item.id || "").toUpperCase(),
                name: String(item.name || item.id || ""),
              }))
              .filter((c: { code: string }) => c.code);
            if (list.length > 0) {
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      // 3. Try cross-company query on SalesOrderHeadersV2 to discover active dataAreaIds
      try {
        const res = await fetch(`${baseUrl}/data/SalesOrderHeadersV2?cross-company=true&$select=dataAreaId&$top=200`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const rawSet = new Set<string>(json.value.map((item: Record<string, unknown>) => String(item.dataAreaId || "").toUpperCase()));
            const codes: string[] = Array.from(rawSet).filter(Boolean);
            if (codes.length > 0) {
              const list = codes.map((code: string) => {
                const match = defaultCompanies.find((d) => d.code === code);
                return match || { code, name: `${code} (Dynamics 365)` };
              });
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      cachedCompaniesList = { data: defaultCompanies, expiresAt: now + 300_000 };
      return defaultCompanies;
    } catch (err) {
      logger.warn("Could not fetch live legal entities from D365, using default companies", { error: (err as Error).message });
      cachedCompaniesList = { data: defaultCompanies, expiresAt: now + 60_000 };
      return defaultCompanies;
    }
  }
}
