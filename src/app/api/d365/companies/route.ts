import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

let cachedCompanies: { code: string; name: string }[] | null = null;
let lastCompaniesFetch = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache

export const GET = route(async () => {
  await requireSession();

  const now = Date.now();
  if (cachedCompanies && now - lastCompaniesFetch < CACHE_TTL_MS) {
    return json({ ok: true, companies: cachedCompanies });
  }

  const list = await D365Service.getCompanies();
  cachedCompanies = list;
  lastCompaniesFetch = now;

  return json({ ok: true, companies: list });
});
