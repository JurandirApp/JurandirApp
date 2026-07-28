"use server";

import { createLead } from "@/lib/db/leads";
import { recordSearchEvent } from "@/lib/db/search";
import { leadCreateSchema, searchEventSchema } from "@/lib/validation";

export async function createLeadAction(input: {
  name: string; owner: string; city: string; whatsapp: string; email: string;
  type: string; message: string;
}): Promise<{ ok: boolean }> {
  const parsed = leadCreateSchema.safeParse({
    name: input.owner || input.name,
    establishmentName: input.name,
    owner: input.owner,
    city: input.city || undefined,
    phone: input.whatsapp || undefined,
    email: input.email || undefined,
    type: input.type || undefined,
    message: input.message || undefined,
  });
  if (!parsed.success) return { ok: false };
  try {
    await createLead(parsed.data);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function recordSearchEventAction(filters: {
  city?: string; neighborhood?: string; cuisine?: string; type?: string; openNow?: boolean;
}): Promise<void> {
  const parsed = searchEventSchema.safeParse({
    city: filters.city || undefined,
    neighborhood: filters.neighborhood || undefined,
    cuisine: filters.cuisine || undefined,
    type: filters.type || undefined,
    openNow: filters.openNow || undefined,
  });
  if (!parsed.success) return;
  // Ignore empty searches (no dimension set).
  if (!parsed.data.city && !parsed.data.neighborhood && !parsed.data.cuisine && !parsed.data.type && !parsed.data.openNow) return;
  try {
    await recordSearchEvent(parsed.data);
  } catch {
    /* fire-and-forget analytics */
  }
}
