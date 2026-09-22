/** Date-range presets for list filters (client-safe, uses the browser's local time zone). */
export type DateRangePreset =
  | "ALL" | "TODAY" | "YESTERDAY" | "THIS_WEEK" | "LAST_WEEK" | "LAST_7" | "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS" | "THIS_YEAR" | "CUSTOM";

export const DATE_RANGE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "ALL", label: "All dates" },
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "LAST_WEEK", label: "Last week" },
  { value: "LAST_7", label: "Last 7 days" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "LAST_3_MONTHS", label: "Last 3 months" },
  { value: "THIS_YEAR", label: "This year" },
  { value: "CUSTOM", label: "Custom…" },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Inclusive yyyy-MM-dd range for a preset (weeks start on Monday). */
export function presetRange(preset: DateRangePreset, now = new Date()): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  switch (preset) {
    case "TODAY": return { from: ymd(today), to: ymd(today) };
    case "YESTERDAY": return { from: ymd(addDays(today, -1)), to: ymd(addDays(today, -1)) };
    case "THIS_WEEK": return { from: ymd(monday), to: ymd(today) };
    case "LAST_WEEK": return { from: ymd(addDays(monday, -7)), to: ymd(addDays(monday, -1)) };
    case "LAST_7": return { from: ymd(addDays(today, -6)), to: ymd(today) };
    case "THIS_MONTH": return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case "LAST_MONTH": return {
      from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
    case "LAST_3_MONTHS": return { from: ymd(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: ymd(today) };
    case "THIS_YEAR": return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
    default: return null;
  }
}

/** Convert an inclusive local yyyy-MM-dd range to ISO instants for the API. */
export function rangeToIso(from?: string, to?: string): { fromIso?: string; toIso?: string } {
  const f = from ? new Date(`${from}T00:00:00`) : undefined;
  const t = to ? new Date(`${to}T23:59:59.999`) : undefined;
  return {
    fromIso: f && !Number.isNaN(f.getTime()) ? f.toISOString() : undefined,
    toIso: t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined,
  };
}

export function formatRangeLabel(from?: string, to?: string): string {
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  if (from) return `from ${fmt(from)}`;
  if (to) return `until ${fmt(to)}`;
  return "All dates";
}
