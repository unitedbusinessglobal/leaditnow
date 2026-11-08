-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cin" TEXT,
ADD COLUMN     "companyClass" TEXT,
ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "listed" BOOLEAN,
ADD COLUMN     "paidUpCapitalInr" DOUBLE PRECISION,
ADD COLUMN     "revenueInr" DOUBLE PRECISION,
ADD COLUMN     "revenueSource" TEXT,
ADD COLUMN     "stockExchange" TEXT,
ADD COLUMN     "stockSymbol" TEXT,
ADD COLUMN     "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "LeadCandidate" ADD COLUMN     "extra" JSONB;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "ContactPoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactPoint_accountId_kind_value_key" ON "ContactPoint"("accountId", "kind", "value");

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

