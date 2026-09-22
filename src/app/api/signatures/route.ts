import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { z } from "zod";

const createSignatureSchema = z.object({
  label: z.string().default("My Signature"),
  base64Png: z.string().min(1),
  isDefault: z.boolean().default(false),
});

const patchSignatureSchema = z.object({
  id: z.string().uuid(),
  isDefault: z.boolean().optional(),
  label: z.string().optional(),
});

export const GET = route(async () => {
  await requireSession();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("cmr_signatures")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const signatures = await Promise.all(
    (data || []).map(async (sig) => {
      let dataUrl: string | null = null;
      let signedUrl: string | null = null;
      try {
        if (sig.storage_path) {
          const { data: fileBlob } = await sb.storage
            .from(Buckets.signatures)
            .download(sig.storage_path);
          if (fileBlob) {
            const buf = Buffer.from(await fileBlob.arrayBuffer());
            dataUrl = `data:${sig.mime_type || "image/png"};base64,${buf.toString("base64")}`;
          }
          const { data: signed } = await sb.storage
            .from(Buckets.signatures)
            .createSignedUrl(sig.storage_path, 86400);
          signedUrl = signed?.signedUrl || null;
        }
      } catch (e) {
        console.warn(`Error loading signature ${sig.id}:`, e);
      }
      return {
        ...sig,
        dataUrl: dataUrl || signedUrl,
        signedUrl,
      };
    })
  );

  return json({ ok: true, signatures });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  const body = await req.json();
  const parsed = createSignatureSchema.parse(body);

  const cleanBase64 = parsed.base64Png.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  const fileName = `${session.user.id || "user"}_${Date.now()}.png`;

  const sb = supabaseAdmin();

  if (parsed.isDefault) {
    // Unset other default signatures
    await sb
      .from("cmr_signatures")
      .update({ is_default: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { error: uploadErr } = await sb.storage.from(Buckets.signatures).upload(fileName, buffer, {
    contentType: "image/png",
    upsert: true,
  });

  if (uploadErr) throw uploadErr;

  const { data, error } = await sb
    .from("cmr_signatures")
    .insert({
      user_id: session.user.id && /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : "00000000-0000-0000-0000-000000000001",
      label: parsed.label,
      storage_path: fileName,
      mime_type: "image/png",
      is_default: parsed.isDefault,
    })
    .select()
    .single();

  if (error) throw error;
  const fullDataUrl = parsed.base64Png.startsWith("data:")
    ? parsed.base64Png
    : `data:image/png;base64,${parsed.base64Png}`;
  return json({ ok: true, signature: { ...data, dataUrl: fullDataUrl } }, { status: 201 });
});

export const PATCH = route(async (req) => {
  await requireSession();
  const body = await req.json();
  const parsed = patchSignatureSchema.parse(body);

  const sb = supabaseAdmin();

  if (parsed.isDefault) {
    await sb
      .from("cmr_signatures")
      .update({ is_default: false })
      .neq("id", parsed.id);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.isDefault !== undefined) updates.is_default = parsed.isDefault;
  if (parsed.label !== undefined) updates.label = parsed.label;

  const { data, error } = await sb
    .from("cmr_signatures")
    .update(updates)
    .eq("id", parsed.id)
    .select()
    .single();

  if (error) throw error;
  return json({ ok: true, signature: data });
});

export const DELETE = route(async (req) => {
  await requireSession();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: sig } = await sb.from("cmr_signatures").select("storage_path").eq("id", id).maybeSingle();
  if (sig?.storage_path) {
    try {
      await sb.storage.from(Buckets.signatures).remove([sig.storage_path]);
    } catch {
      // ignore storage cleanup failure
    }
  }
  await sb.from("cmr_signatures").delete().eq("id", id);
  return json({ ok: true });
});
