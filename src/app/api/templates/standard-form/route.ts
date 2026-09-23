import { route } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { getBuiltInForm } from "@/lib/render/cmr-renderer";
import { isFormLang } from "@/lib/cmr/i18n";

/** GET /api/templates/standard-form?lang=da&noHeading=1 – the built-in 24-box form (designer background). */
export const GET = route(async (req) => {
  await requireCapability("viewTemplates");
  const sp = req.nextUrl.searchParams;
  const lang = sp.get("lang");
  const bytes = await getBuiltInForm(isFormLang(lang) ? lang : "de", sp.get("noHeading") === "1");
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=3600" },
  });
});
