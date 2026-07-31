import { z } from "zod";
import { PaymentMethod } from "@prisma/client";

export const loginSchema = z.object({
  // Login identifier: an e-mail OR a username (stored in User.email either way).
  email: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().default(false),
});

export const leadCreateSchema = z.object({
  name: z.string().min(1).max(120),
  establishmentName: z.string().min(1).max(120),
  city: z.string().max(120).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  message: z.string().max(1000).optional(),
  owner: z.string().max(120).optional(),
  type: z.string().max(120).optional(),
});

const orderItemInput = z.object({
  menuItemId: z.string().optional(),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const orderCreateSchema = z.object({
  establishmentId: z.string().min(1),
  locationLabel: z.string().min(1),
  posto: z.string().optional(),
  customerName: z.string().optional(),
  note: z.string().max(200).optional(),
  items: z.array(orderItemInput).min(1),
  payment: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("full"),
      method: z.nativeEnum(PaymentMethod),
      installments: z.number().int().min(1).max(6).default(1),
      cardMask: z.string().optional(),
    }),
    z.object({
      kind: z.literal("split"),
      shares: z
        .array(z.object({ method: z.nativeEnum(PaymentMethod).nullable() }))
        .min(2)
        .max(8),
    }),
  ]),
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const menuItemUpsertSchema = z.object({
  id: z.string().optional(),
  establishmentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  oldPrice: z.number().nonnegative().nullable().optional(),
  photo: z.string().optional(),
  measure: z.number().int().nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  active: z.boolean().default(true),
});
export type MenuItemUpsertInput = z.infer<typeof menuItemUpsertSchema>;

export const qrSpotCreateSchema = z.object({
  establishmentId: z.string().min(1),
  label: z.string().min(1),
});

export const searchEventSchema = z.object({
  query: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  cuisine: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  openNow: z.boolean().optional(),
  establishmentId: z.string().optional(),
});
export type SearchEventInput = z.infer<typeof searchEventSchema>;
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const establishmentUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  owner: z.string().min(1),
  type: z.string().min(1),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  posto: z.string().optional(),
  radiusM: z.string().optional(),
  plan: z.string().min(1),
  platformFeePct: z.coerce.number().int().min(0).max(100),
  user: z.string().min(1),
  password: z.string().optional(), // required on create; blank on edit = keep
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  logoImg: z.string().optional(),
});
export type EstablishmentUpsertInput = z.infer<typeof establishmentUpsertSchema>;

const timeStr = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);
const timeWindow = z.object({ o: timeStr, c: timeStr });
/** Horário semanal: 7 dias, até 2 janelas por dia (índice 0 = domingo). */
const weekScheduleSchema = z.array(z.array(timeWindow).max(2)).max(7);

export const profileSaveSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional(),
  desc: z.string().optional(),
  address: z.string().optional(),
  weekly: weekScheduleSchema.optional(),
  serviceFee: z.coerce.number().int().min(0).max(100),
  radius: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
});
export type ProfileSaveInput = z.infer<typeof profileSaveSchema>;

export const passwordChangeSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(6),
});

/** Cadastro de recebedor Pagar.me (conta bancária + KYC — exigidos na criação).
 *  A biometria/prova de vida o dono conclui depois no webapp do Pagar.me. */
export const pagarmeRecipientSchema = z.object({
  type: z.enum(["individual", "corporation"]),
  name: z.string().min(1),
  email: z.string().email(),
  document: z.string().min(11),
  phone: z.string().optional(),
  birthdate: z.string().optional(),
  motherName: z.string().optional(),
  monthlyIncome: z.coerce.number().optional(),
  professionalOccupation: z.string().optional(),
  bank: z.string().min(1),
  branchNumber: z.string().min(1),
  branchCheckDigit: z.string().optional(),
  accountNumber: z.string().min(1),
  accountCheckDigit: z.string().min(1),
  accountType: z.enum(["checking", "savings"]),
  street: z.string().optional(),
  streetNumber: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});
export type PagarmeRecipientForm = z.infer<typeof pagarmeRecipientSchema>;
