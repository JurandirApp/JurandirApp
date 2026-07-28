-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "cuisine" TEXT,
ADD COLUMN     "rankingOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating" DECIMAL(2,1),
ADD COLUMN     "weeklyHours" JSONB;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "owner" TEXT,
ADD COLUMN     "type" TEXT;
