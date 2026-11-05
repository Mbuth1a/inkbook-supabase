import { z } from "zod";
import { MAX_REF_IMAGES, placements, sizes, styles, type SizeKey } from "./config.ts";

export const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const sizeKeys = Object.keys(sizes) as [SizeKey, ...SizeKey[]];

export const bookingInput = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().trim().min(9).max(20),
  email: z.union([z.literal(""), z.email().max(120)]).optional(),
  style: z.enum(styles),
  concept: z.string().trim().min(10, "Tell us a bit more about the idea").max(1200),
  size: z.enum(sizeKeys),
  placement: z.enum(placements),
  sizeCm: z.string().trim().max(24).optional(),
  refs: z.array(z.string().regex(UPLOAD_NAME)).max(MAX_REF_IMAGES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(24 * 60),
  acceptTerms: z.literal(true, { error: "Please confirm you accept the deposit terms" }),
});

export type BookingInput = z.infer<typeof bookingInput>;
