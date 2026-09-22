import { readFile } from "node:fs/promises";
import path from "node:path";
import { route } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { downloadAsset, getAsset } from "@/lib/db/repositories/assets";

/** Streams a private asset to any signed-in user (backgrounds are needed by the designer & PDF viewer). */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireSession();

  const isStandardTemplate =
    params.id === "00000000-0000-0000-0000-000000000001" ||
    params.id === "builtin-hydraspecma";

  if (isStandardTemplate) {
    const filePath = path.join(process.cwd(), "public", "templates", "hydraspecma-cmr-template.pdf");
    try {
      const bytes = await readFile(filePath);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.length),
          "Content-Disposition": 'inline; filename="hydraspecma-cmr-template.pdf"',
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      // Fall through to database lookup
    }
  }

  const asset = await getAsset(params.id);
  if (!asset) {
    // Graceful fallback to bundled PDF
    const filePath = path.join(process.cwd(), "public", "templates", "hydraspecma-cmr-template.pdf");
    const bytes = await readFile(filePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": 'inline; filename="hydraspecma-cmr-template.pdf"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  try {
    const bytes = await downloadAsset(asset);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${asset.file_name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    // If Supabase storage download fails, fallback to bundled template PDF
    const filePath = path.join(process.cwd(), "public", "templates", "hydraspecma-cmr-template.pdf");
    const bytes = await readFile(filePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${asset.file_name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
});
