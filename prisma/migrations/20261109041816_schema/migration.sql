-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "LeadCandidate" ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "SavedSearch" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IN';

