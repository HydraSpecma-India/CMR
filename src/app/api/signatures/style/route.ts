import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

/** Every user's own auto-signature style (font, text, details). */
const keyFor = (email: string) => `signature.style.${email.toLowerCase()}`;

export const GET = route(async () => {
  const session = await requireSession();
  const { data } = await supabaseAdmin().from("cmr_app_settings").select("value").eq("key", keyFor(session.user.email)).maybeSingle();
  return json({ ok: true, style: data?.value ?? null });
});

const Style = z.object({
  signatureText: z.string().max(80),
  font: z.string().max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().min(12).max(72),
  line1: z.string().max(80),
  line2: z.string().max(80),
  showDate: z.boolean(),
  showTime: z.boolean(),
  showBadge: z.boolean(),
  showBorder: z.boolean(),
  showVerifiedLine: z.boolean(),
});

export const PUT = route(async (req) => {
  const session = await requireSession();
  const style = Style.parse((await req.json())?.style);
  const { error } = await supabaseAdmin().from("cmr_app_settings").upsert({
    key: keyFor(session.user.email),
    value: style,
    description: "Personal auto-signature style",
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return json({ ok: true });
});
