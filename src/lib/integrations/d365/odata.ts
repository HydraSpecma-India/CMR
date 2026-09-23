import "server-only";
import { logger } from "@/lib/logging/logger";
import { D365Service, type D365Config } from "./service";

export type Row = Record<string, unknown>;

/** Escape a value for an OData string literal. */
export const esc = (v: string) => v.replace(/'/g, "''");

export async function odata(cfg: D365Config, entity: string, params: { filter?: string; select?: string; top?: number; orderby?: string }): Promise<Row[]> {
  const token = await D365Service.getAccessToken(cfg);
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const q = new URLSearchParams();
  q.set("cross-company", "true");
  if (params.filter) q.set("$filter", params.filter);
  if (params.select) q.set("$select", params.select);
  if (params.orderby) q.set("$orderby", params.orderby);
  q.set("$top", String(params.top ?? 50));
  const url = `${base}/data/${entity}?${q.toString().replace(/\+/g, "%20")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: "odata.maxpagesize=500" }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`D365 ${entity} returned ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { value?: Row[] };
  return json.value ?? [];
}

export async function odataOne(cfg: D365Config, entity: string, filter: string): Promise<Row | null> {
  try {
    const rows = await odata(cfg, entity, { filter, top: 1 });
    return rows[0] ?? null;
  } catch (e) {
    logger.warn("D365 lookup failed", { entity, filter, error: (e as Error).message });
    return null;
  }
}
