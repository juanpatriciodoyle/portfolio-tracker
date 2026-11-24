-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guestExpiresAt" TIMESTAMP(3),
ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_isGuest_guestExpiresAt_idx" ON "User"("isGuest", "guestExpiresAt");

-- The one shared demo account of earlier versions becomes an expired guest: the first sweep erases it and its data.
UPDATE "User" SET "isGuest" = true, "guestExpiresAt" = NOW() WHERE "email" = 'demo@portfolio.local';
