import { z } from "zod";

export const GoodsLineSchema = z.object({
  itemNumber: z.string().max(60).optional(),
  marks: z.string().max(200).default(""),
  packages: z.string().max(30).default(""),
  packing: z.string().max(60).default(""),
  nature: z.string().max(400).default(""),
  statNo: z.string().max(30).default(""),
  grossWeight: z.string().max(30).default(""),
  volume: z.string().max(30).default(""),
});

export const ValuesSchema = z.record(z.string().max(60), z.string().max(2000));

/** data:image/png;base64,... – max ~700 KB */
export const SignatureSchema = z
  .string()
  .max(1_000_000)
  .regex(/^data:image\/(png|jpeg);base64,/, "Signature must be a PNG/JPEG data URL")
  .optional();

export const CompanySchema = z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9_]+$/);
