import { prisma } from "./prisma";
import { leadCreateSchema, type LeadCreateInput } from "../validation";

export function createLead(input: LeadCreateInput) {
  const data = leadCreateSchema.parse(input);
  return prisma.lead.create({ data });
}

export function listLeads() {
  return prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
}
