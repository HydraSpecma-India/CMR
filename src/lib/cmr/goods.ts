import { GOODS, goodsField } from "./layout";
import type { CmrGoodsLine } from "./types";

/** Client-safe helpers for boxes 6–12. */

export const num = (s: string | number | undefined | null): number => {
  if (s === undefined || s === null) return 0;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n: number, decimals = 2) => {
  if (!n) return "";
  const r = Number(n.toFixed(decimals));
  return r.toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: false });
};

export function goodsTotals(goods: CmrGoodsLine[]) {
  const packages = goods.reduce((s, g) => s + num(g.packages), 0);
  const weight = goods.reduce((s, g) => s + num(g.grossWeight), 0);
  const volume = goods.reduce((s, g) => s + num(g.volume), 0);
  return { packages, weight, volume };
}

/**
 * Converts goods lines into the Goods{row}{Column} field values of the form. When there are more
 * lines than rows on the form, the last row points to the continuation sheet the renderer appends.
 */
export function goodsToValues(goods: CmrGoodsLine[]): Record<string, string> {
  const v: Record<string, string> = {};
  const rows = GOODS.rows;
  const overflow = goods.length > rows;
  const visible = overflow ? goods.slice(0, rows - 1) : goods;
  for (let r = 1; r <= rows; r++) {
    const g = visible[r - 1];
    v[goodsField(r, "Marks")] = g?.marks ?? "";
    v[goodsField(r, "Packages")] = g?.packages ?? "";
    v[goodsField(r, "Packing")] = g?.packing ?? "";
    v[goodsField(r, "Nature")] = g?.nature ?? "";
    v[goodsField(r, "StatNo")] = g?.statNo ?? "";
    v[goodsField(r, "GrossWeight")] = g?.grossWeight ?? "";
    v[goodsField(r, "Volume")] = g?.volume ?? "";
  }
  if (overflow) {
    const rest = goods.slice(rows - 1);
    const t = goodsTotals(rest);
    v[goodsField(rows, "Nature")] = `+ ${rest.length} further line(s) – see continuation sheet`;
    v[goodsField(rows, "Packages")] = fmt(t.packages, 0);
    v[goodsField(rows, "GrossWeight")] = fmt(t.weight);
    v[goodsField(rows, "Volume")] = fmt(t.volume, 3);
  }
  const t = goodsTotals(goods);
  v.TotalPackages = fmt(t.packages, 0);
  v.TotalGrossWeight = fmt(t.weight);
  v.TotalVolume = fmt(t.volume, 3);
  return v;
}

export const emptyGoodsLine = (): CmrGoodsLine => ({ marks: "", packages: "", packing: "", nature: "", statNo: "", grossWeight: "", volume: "" });
