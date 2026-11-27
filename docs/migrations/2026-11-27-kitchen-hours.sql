-- Horário da cozinha (aditivo, idempotente). Aplicar ANTES do deploy.
ALTER TABLE "Establishment" ADD COLUMN IF NOT EXISTS "kitchenHours" JSONB;
ALTER TABLE "Establishment" ADD COLUMN IF NOT EXISTS "kitchenCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
