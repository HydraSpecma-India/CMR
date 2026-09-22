"use client";

import "@fontsource/dancing-script/latin-600.css";
import "@fontsource/great-vibes/latin-400.css";
import "@fontsource/allura/latin-400.css";
import "@fontsource/sacramento/latin-400.css";
import "@fontsource/caveat/latin-600.css";
import "@fontsource/homemade-apple/latin-400.css";

/** Personal auto-signature style – every user can change font, text and details. */
export interface SignatureStyle {
  /** Text written in the handwriting font (defaults to the user's name) */
  signatureText: string;
  font: string;
  color: string;
  size: number; // px on the 480×140 canvas
  line1: string; // e.g. designation
  line2: string; // e.g. department / company
  showDate: boolean;
  showTime: boolean;
  showBadge: boolean;
  showBorder: boolean;
  showVerifiedLine: boolean;
}

export const SIGNATURE_FONTS: Array<{ id: string; label: string; css: string; weight: number; scale: number }> = [
  { id: "dancing", label: "Dancing Script", css: "'Dancing Script'", weight: 600, scale: 1 },
  { id: "greatvibes", label: "Great Vibes", css: "'Great Vibes'", weight: 400, scale: 1.1 },
  { id: "allura", label: "Allura", css: "'Allura'", weight: 400, scale: 1.15 },
  { id: "sacramento", label: "Sacramento", css: "'Sacramento'", weight: 400, scale: 1.2 },
  { id: "caveat", label: "Caveat (pen)", css: "'Caveat'", weight: 600, scale: 1 },
  { id: "homemade", label: "Homemade Apple", css: "'Homemade Apple'", weight: 400, scale: 0.75 },
  { id: "serif", label: "Classic italic", css: "Georgia, 'Times New Roman', serif", weight: 400, scale: 0.85 },
];

export const SIGNATURE_COLORS = [
  { id: "#0b3d91", label: "Blue ink" },
  { id: "#0f172a", label: "Black" },
  { id: "#1e40af", label: "Royal blue" },
  { id: "#065f46", label: "Green" },
];

export function defaultSignatureStyle(userName: string): SignatureStyle {
  return {
    signatureText: userName || "Authorized Signatory",
    font: "dancing",
    color: "#0b3d91",
    size: 34,
    line1: "Shipping",
    line2: "HydraSpecma",
    showDate: true,
    showTime: false,
    showBadge: false,
    showBorder: false,
    showVerifiedLine: true,
  };
}

/** Render the signature to a transparent PNG data URL (fonts are awaited so the first render is correct). */
export async function renderAutoSignature(style: SignatureStyle): Promise<string> {
  if (typeof document === "undefined") return "";
  const font = SIGNATURE_FONTS.find((f) => f.id === style.font) ?? SIGNATURE_FONTS[0];
  const size = Math.round(Math.max(16, Math.min(60, style.size)) * font.scale);
  const fontSpec = `${font.weight} ${size}px ${font.css}`;
  try {
    await document.fonts?.load(fontSpec, style.signatureText || "Signature");
  } catch {
    /* fall back to whatever is available */
  }

  const W = 480;
  const H = 140;
  const scale = 2; // crisp when printed
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);

  if (style.showBorder) {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }

  let x = 16;
  if (style.showBadge) {
    ctx.fillStyle = "#0284c7";
    ctx.beginPath();
    ctx.arc(34, 44, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(26, 44);
    ctx.lineTo(32, 50);
    ctx.lineTo(43, 37);
    ctx.stroke();
    x = 60;
  }

  // Handwritten signature – shrink to fit the width
  ctx.fillStyle = style.color;
  ctx.textBaseline = "alphabetic";
  let s = size;
  ctx.font = `${font.weight} ${s}px ${font.css}`;
  const text = style.signatureText || "Signature";
  while (s > 14 && ctx.measureText(text).width > W - x - 14) {
    s -= 1;
    ctx.font = `${font.weight} ${s}px ${font.css}`;
  }
  const baseline = 16 + s * 0.95;
  ctx.fillText(text, x, Math.min(baseline, 72));

  // underline stroke
  ctx.strokeStyle = style.color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, Math.min(baseline, 72) + 8);
  ctx.lineTo(Math.min(W - 14, x + ctx.measureText(text).width + 10), Math.min(baseline, 72) + 8);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Detail lines
  const details: Array<{ text: string; bold?: boolean }> = [];
  if (style.line1.trim()) details.push({ text: style.line1.trim(), bold: true });
  if (style.line2.trim()) details.push({ text: style.line2.trim() });
  const now = new Date();
  const stamp = [
    style.showDate ? now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
    style.showTime ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
  ].filter(Boolean).join(" ");
  if (style.showVerifiedLine || stamp) details.push({ text: [style.showVerifiedLine ? "Digitally signed" : "", stamp].filter(Boolean).join(" · ") });

  let y = Math.min(baseline, 72) + 24;
  for (const d of details.slice(0, 3)) {
    ctx.fillStyle = d.bold ? "#1e293b" : "#475569";
    ctx.font = `${d.bold ? "600" : "400"} 11px "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.fillText(d.text, x, y);
    y += 15;
  }
  return canvas.toDataURL("image/png");
}

const LOCAL_KEY = "cmr.signatureStyle";

export function loadLocalStyle(): SignatureStyle | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SignatureStyle) : null;
  } catch {
    return null;
  }
}

export function saveLocalStyle(style: SignatureStyle) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(style));
  } catch {
    /* ignore */
  }
}
