-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('CAMPAIGN', 'ADGROUP', 'KEYWORD');

-- CreateEnum
CREATE TYPE "RuleMetric" AS ENUM ('CPA', 'CPT', 'SPEND', 'INSTALLS', 'TAPS', 'TTR', 'CONVERSION_RATE');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('GREATER_THAN', 'LESS_THAN');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('NOTIFY', 'PAUSE');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "metric" "RuleMetric" NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "lookbackDays" INTEGER NOT NULL DEFAULT 7,
    "action" "RuleAction" NOT NULL DEFAULT 'NOTIFY',
    "campaignId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleAlert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_userId_orgId_idx" ON "AutomationRule"("userId", "orgId");

-- CreateIndex
CREATE INDEX "RuleAlert_userId_orgId_createdAt_idx" ON "RuleAlert"("userId", "orgId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleAlert_ruleId_idx" ON "RuleAlert"("ruleId");

-- AddForeignKey
ALTER TABLE "RuleAlert" ADD CONSTRAINT "RuleAlert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
