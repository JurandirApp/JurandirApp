-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SearchEvent" ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "MonthlyStat" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "gmv" DECIMAL(12,2) NOT NULL,
    "byCredit" DECIMAL(12,2) NOT NULL,
    "byDebit" DECIMAL(12,2) NOT NULL,
    "byPix" DECIMAL(12,2) NOT NULL,
    "byUsdc" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "MonthlyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyStat_establishmentId_year_month_key" ON "MonthlyStat"("establishmentId", "year", "month");

-- AddForeignKey
ALTER TABLE "MonthlyStat" ADD CONSTRAINT "MonthlyStat_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
