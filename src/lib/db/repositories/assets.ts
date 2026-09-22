import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { Buckets, supabaseAdmin } from "@/lib/db/supabase-admin";
import { Errors } from "@/lib/errors";

export type AssetKind = "background" | "logo" | "image" | "font";

export interface AssetRow {
  id: string;
  template_id: string | null;
  kind: AssetKind;
  file_name: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number;
  page_count: number | null;
  width_pt: number | null;
  height_pt: number | null;
  sha256: string | null;
  created_by: string | null;
  created_at: string;
}

const ALLOWED: Record<AssetKind, string[]> = {
  background: ["application/pdf", "image/png", "image/jpeg"],
  logo: ["image/png", "image/jpeg"],
  image: ["image/png", "image/jpeg"],
  font: ["font/ttf", "application/octet-stream", "font/otf"],
};
const MAX_BYTES = 20 * 1024 * 1024;

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export async function uploadAsset(input: {
  kind: AssetKind;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  templateId?: string | null;
  userId?: string;
}): Promise<AssetRow> {
  if (!ALLOWED[input.kind].includes(input.mimeType)) throw Errors.validation(`File type ${input.mimeType} is not allowed for ${input.kind}.`);
  if (input.bytes.length > MAX_BYTES) throw Errors.validation("File exceeds the 20 MB limit.");

  let pageCount: number | null = null;
  let widthPt: number | null = null;
  let heightPt: number | null = null;

  if (input.mimeType === "application/pdf") {
    try {
      const doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount();
      const { width, height } = doc.getPage(0).getSize();
      widthPt = width;
      heightPt = height;
    } catch {
      throw Errors.validation("The PDF could not be read. Make sure it is not corrupted or password protected.");
    }
  } else {
    const s = input.mimeType === "image/png" ? pngSize(input.bytes) : jpegSize(input.bytes);
    if (s) {
      // pixels → points at 96 dpi (designer scales to fit anyway)
      widthPt = (s.w * 72) / 96;
      heightPt = (s.h * 72) / 96;
    }
    pageCount = 1;
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const storagePath = `${input.kind}/${sha256.slice(0, 12)}-${safeName}`;

  const db = supabaseAdmin();
  const { error: upErr } = await db.storage.from(Buckets.templateAssets).upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    upsert: true,
  });
  if (upErr) throw Errors.integration("Storage", upErr.message);

  const { data, error } = await db
    .from("cmr_template_assets")
    .upsert(
      {
        template_id: input.templateId ?? null,
        kind: input.kind,
        file_name: input.fileName,
        mime_type: input.mimeType,
        storage_path: storagePath,
        size_bytes: input.bytes.length,
        page_count: pageCount,
        width_pt: widthPt,
        height_pt: heightPt,
        sha256,
        created_by: input.userId && /^[0-9a-f-]{36}$/i.test(input.userId) ? input.userId : null,
      },
      { onConflict: "storage_path" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as AssetRow;
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const { data, error } = await supabaseAdmin().from("cmr_template_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as AssetRow) ?? null;
}

export async function downloadAsset(asset: AssetRow): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(Buckets.templateAssets).download(asset.storage_path);
  if (error || !data) throw Errors.integration("Storage", error?.message ?? "download failed");
  return Buffer.from(await data.arrayBuffer());
}

export async function listAssets(kind?: AssetKind): Promise<AssetRow[]> {
  let q = supabaseAdmin().from("cmr_template_assets").select("*").order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return data as AssetRow[];
}
