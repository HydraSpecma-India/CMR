import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { SignaturesClient } from "./signatures-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stored Signatures" };

export default async function SignaturesPage() {
  await requireSession();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("cmr_signatures")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const signatures = await Promise.all(
    (data || []).map(async (sig) => {
      let dataUrl: string | null = null;
      try {
        if (sig.storage_path) {
          const { data: fileBlob } = await sb.storage
            .from(Buckets.signatures)
            .download(sig.storage_path);
          if (fileBlob) {
            const buf = Buffer.from(await fileBlob.arrayBuffer());
            dataUrl = `data:${sig.mime_type || "image/png"};base64,${buf.toString("base64")}`;
          }
        }
      } catch (e) {
        console.warn("Failed to load signature data URL:", e);
      }
      return { ...sig, dataUrl };
    })
  );

  return <SignaturesClient initialSignatures={signatures} />;
}
