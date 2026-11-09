-- AlterTable
ALTER TABLE "ContactPoint" ADD COLUMN     "confidence" INTEGER,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'website',
ADD COLUMN     "title" TEXT;

