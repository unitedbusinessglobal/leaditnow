-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'ADDED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "apolloId" TEXT,
ADD COLUMN     "placeId" TEXT;

-- CreateTable
CREATE TABLE "LeadCandidate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "staffSize" INTEGER,
    "note" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "keywords" TEXT,
    "staffRange" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "existing" INTEGER NOT NULL DEFAULT 0,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "savedSearchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCandidate_orgId_status_idx" ON "LeadCandidate"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCandidate_orgId_source_externalId_key" ON "LeadCandidate"("orgId", "source", "externalId");

-- CreateIndex
CREATE INDEX "SavedSearch_orgId_active_idx" ON "SavedSearch"("orgId", "active");

-- CreateIndex
CREATE INDEX "DiscoveryRun_orgId_createdAt_idx" ON "DiscoveryRun"("orgId", "createdAt");

