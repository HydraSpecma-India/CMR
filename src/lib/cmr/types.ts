/** Client-safe CMR types shared by the wizard, API and renderer. */

export interface CmrGoodsLine {
  itemNumber?: string;
  marks: string;
  packages: string;
  packing: string;
  nature: string;
  statNo: string;
  grossWeight: string;
  volume: string;
}

export interface PackingSlipSummary {
  company: string;
  packingSlipId: string;
  salesOrder: string;
  deliveryDate: string;
  customerAccount: string;
  deliveryName: string;
  deliveryCountry?: string;
  customerRef?: string;
  deliveryTerms?: string;
  lineCount?: number;
  /** CMR already issued for this packing slip */
  cmrNumber?: string | null;
  cmrId?: string | null;
}

/** Where each pre-filled value came from – shown as a badge in the wizard. */
export type ValueSource = "D365" | "SETTING" | "SYSTEM" | "MANUAL";

export interface CmrPrefill {
  mode: "mock" | "live";
  packingSlip: PackingSlipSummary;
  values: Record<string, string>;
  sources: Record<string, ValueSource>;
  goods: CmrGoodsLine[];
  /** raw D365 records (for traceability, stored in d365_context_json) */
  context: Record<string, unknown>;
  warnings: string[];
}
