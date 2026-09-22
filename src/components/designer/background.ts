"use client";

/**
 * Renders a page of an uploaded background asset (PDF or image) to an
 * HTMLImageElement for the designer. PDF pages are rasterised with PDF.js at
 * 2× the page size for crisp zooming. Results are cached per asset/page.
 */
const cache = new Map<string, Promise<HTMLImageElement>>();
const pdfBytesCache = new Map<string, Promise<Uint8Array>>();

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded"));
    img.src = url;
  });
}

async function loadPdfBytes(url: string): Promise<Uint8Array> {
  const hit = pdfBytesCache.get(url);
  if (hit) return hit;

  const request = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  });
  pdfBytesCache.set(url, request);
  request.catch(() => pdfBytesCache.delete(url));
  return request;
}

export function loadBackgroundImage(assetId: string, mimeType: string, pageIndex: number): Promise<HTMLImageElement> {
  const key = `${assetId}:${pageIndex}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = (async () => {
    let url = `/api/assets/${assetId}`;
    if (
      assetId === "00000000-0000-0000-0000-000000000001" ||
      assetId === "builtin-hydraspecma" ||
      assetId === "default"
    ) {
      url = "/templates/hydraspecma-cmr-template.pdf";
    }

    if (mimeType !== "application/pdf" && !url.endsWith(".pdf")) {
      return imageFromUrl(url);
    }

    const pdfjs = await loadPdfjs();

    // Cache the source PDF separately from its rasterized pages. A multi-page
    // template otherwise downloads the same PDF once for every page opened.
    let bytes: Uint8Array;
    try {
      bytes = await loadPdfBytes(url);
    } catch {
      // Fallback to bundled HydraSpecma template PDF
      bytes = await loadPdfBytes("/templates/hydraspecma-cmr-template.pdf");
    }

    // PDF.js may transfer the buffer to its worker, so give it a fresh copy.
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const targetPage = Math.min(Math.max(1, pageIndex + 1), doc.numPages);
    const page = await doc.getPage(targetPage);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return imageFromUrl(canvas.toDataURL("image/png"));
  })();

  cache.set(key, p);
  p.catch((err) => {
    console.error("loadBackgroundImage error:", err);
    cache.delete(key);
  });
  return p;
}

/** Generic asset (logo/image) loader with cache. */
export function loadAssetImage(assetId: string): Promise<HTMLImageElement> {
  const key = `img:${assetId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = imageFromUrl(`/api/assets/${assetId}`);
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
