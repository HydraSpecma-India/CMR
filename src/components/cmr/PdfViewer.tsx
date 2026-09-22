"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** true on phones/tablets (touch or narrow) – where <iframe> PDF rendering is unreliable (iOS, Android Chrome). */
export function useCompactViewer(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px), (pointer: coarse)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

/**
 * Responsive PDF viewer.
 *  • Desktop: native browser viewer in an iframe.
 *  • Phone / tablet: pages rendered with PDF.js to canvases that fit the screen width
 *    (mobile browsers either do not render PDFs in iframes or force a download).
 */
export function PdfViewer({
  src,
  title = "PDF document",
  downloadName,
  className,
  desktopHeight = "h-[650px]",
}: {
  src: string;
  title?: string;
  downloadName?: string;
  className?: string;
  desktopHeight?: string;
}) {
  const compact = useCompactViewer();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null; pages: number }>({ loading: true, error: null, pages: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!compact) return;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    setState({ loading: true, error: null, pages: 0 });

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setState({ loading: false, error: null, pages: doc.numPages });
        const width = host.clientWidth || window.innerWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = ((width * zoom) / base.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.style.maxWidth = zoom === 1 ? "100%" : "none";
          canvas.className = "mx-auto mb-3 block bg-white shadow-md rounded-sm";
          const wrap = document.createElement("div");
          wrap.appendChild(canvas);
          const label = document.createElement("div");
          label.className = "mb-3 -mt-2 text-center text-[10px] text-ink-400";
          label.textContent = `Page ${n} / ${doc.numPages}`;
          wrap.appendChild(label);
          host.appendChild(wrap);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e as Error).message, pages: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, compact, zoom]);

  if (!compact) {
    return <iframe src={src} className={cn("w-full border-0", desktopHeight, className)} title={title} />;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-3 py-2 text-xs">
        <span className="font-medium text-ink-600">{state.pages ? `${state.pages} page${state.pages === 1 ? "" : "s"}` : "PDF"}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="rounded p-2 hover:bg-ink-100 disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" className="rounded p-2 hover:bg-ink-100 disabled:opacity-40" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="rounded p-2 hover:bg-ink-100" aria-label="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </a>
          <a href={src} download={downloadName || true} className="rounded p-2 hover:bg-ink-100" aria-label="Download">
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="max-h-[75dvh] overflow-auto bg-ink-100 p-3">
        {state.loading && (
          <div className="flex h-60 items-center justify-center gap-2 text-sm text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading PDF…
          </div>
        )}
        {state.error && (
          <div className="p-6 text-center text-sm text-ink-600">
            Could not display the PDF here ({state.error}).{" "}
            <a href={src} target="_blank" rel="noreferrer" className="font-semibold text-brand-800 underline">
              Open it
            </a>
          </div>
        )}
        <div ref={hostRef} />
      </div>
    </div>
  );
}
