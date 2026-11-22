-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BOUGHT', 'SOLD', 'DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "FixedCostCategory" AS ENUM ('RENT', 'ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS', 'TAXES', 'OTHER');

-- CreateEnum
CREATE TYPE "CostCadence" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BillingCadence" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUAL', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "HousingTenure" AS ENUM ('RENT', 'OWN', 'FAMILY_OR_FREE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userHash" TEXT,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "passkeyCredentialId" TEXT,
    "passkeyPublicKey" TEXT,
    "passkeyCounter" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "country" TEXT NOT NULL DEFAULT 'Spain',
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "annualInflationRate" DOUBLE PRECISION NOT NULL DEFAULT 2.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'CASH',
    "name" TEXT NOT NULL DEFAULT 'Cash',
    "assetClass" TEXT NOT NULL DEFAULT 'Cash',
    "region" TEXT NOT NULL DEFAULT 'Global',
    "sector" TEXT NOT NULL DEFAULT 'Financials',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "investedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "TransactionType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "assetClass" TEXT NOT NULL DEFAULT 'Stock',
    "region" TEXT NOT NULL DEFAULT 'Europe',
    "sector" TEXT NOT NULL DEFAULT 'Technology',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealizedGain" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL DEFAULT 'Stock',
    "region" TEXT NOT NULL DEFAULT 'Europe',
    "sector" TEXT NOT NULL DEFAULT 'Technology',
    "investedAmount" DOUBLE PRECISION NOT NULL,
    "returnedAmount" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL,
    "realizedPnlPercent" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealizedGain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InflationRate" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InflationRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivingPhase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "currency" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "tenure" "HousingTenure" NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivingPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "category" "FixedCostCategory" NOT NULL,
    "cadence" "BillingCadence" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payload" TEXT NOT NULL,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCostItem" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "category" "FixedCostCategory" NOT NULL,
    "cadence" "CostCadence" NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryStatistics" (
    "countryCode" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryStatistics_pkey" PRIMARY KEY ("countryCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userHash_key" ON "User"("userHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_passkeyCredentialId_key" ON "User"("passkeyCredentialId");

-- CreateIndex
CREATE INDEX "User_lastLoginAt_idx" ON "User"("lastLoginAt");

-- CreateIndex
CREATE UNIQUE INDEX "InflationRate_country_year_key" ON "InflationRate"("country", "year");

-- CreateIndex
CREATE INDEX "LivingPhase_userId_startDate_idx" ON "LivingPhase"("userId", "startDate");

-- CreateIndex
CREATE INDEX "BillingRecord_userId_periodStart_idx" ON "BillingRecord"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "BillingRecord_phaseId_idx" ON "BillingRecord"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRecord_userId_fingerprint_key" ON "BillingRecord"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "FixedCostItem_phaseId_idx" ON "FixedCostItem"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizedGain" ADD CONSTRAINT "RealizedGain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivingPhase" ADD CONSTRAINT "LivingPhase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "LivingPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedCostItem" ADD CONSTRAINT "FixedCostItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "LivingPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

