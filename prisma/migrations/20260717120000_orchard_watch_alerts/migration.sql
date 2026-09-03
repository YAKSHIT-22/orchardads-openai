-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('METRIC', 'BUDGET', 'ANOMALY');

-- CreateEnum
CREATE TYPE "AlertScope" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'ADGROUP', 'KEYWORD');

-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('SPEND', 'INSTALLS', 'TAPS', 'IMPRESSIONS', 'CPA', 'CPT', 'CPM', 'TTR', 'CONVERSION_RATE');

-- CreateEnum
CREATE TYPE "AlertComparator" AS ENUM ('ABOVE', 'BELOW', 'CHANGE_UP', 'CHANGE_DOWN');

-- CreateEnum
CREATE TYPE "AlertAction" AS ENUM ('NOTIFY', 'PAUSE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('NEW', 'READ', 'SNOOZED', 'DISMISSED');

-- DropForeignKey
ALTER TABLE "RuleAlert" DROP CONSTRAINT "RuleAlert_ruleId_fkey";

-- DropTable
DROP TABLE "AutomationRule";

-- DropTable
DROP TABLE "RuleAlert";

-- DropEnum
DROP TYPE "RuleAction";

-- DropEnum
DROP TYPE "RuleMetric";

-- DropEnum
DROP TYPE "RuleOperator";

-- DropEnum
DROP TYPE "RuleScope";

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgName" TEXT,
    "name" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "scope" "AlertScope" NOT NULL DEFAULT 'CAMPAIGN',
    "campaignId" TEXT,
    "campaignName" TEXT,
    "metric" "AlertMetric",
    "comparator" "AlertComparator",
    "threshold" DOUBLE PRECISION,
    "comparePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "lookbackDays" INTEGER NOT NULL DEFAULT 7,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "sensitivity" DOUBLE PRECISION,
    "action" "AlertAction" NOT NULL DEFAULT 'NOTIFY',
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "changePct" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL DEFAULT 'NOTIFY',
    "status" "AlertEventStatus" NOT NULL DEFAULT 'NEW',
    "snoozedUntil" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_userId_orgId_idx" ON "Alert"("userId", "orgId");

-- CreateIndex
CREATE INDEX "AlertEvent_userId_orgId_status_idx" ON "AlertEvent"("userId", "orgId", "status");

-- CreateIndex
CREATE INDEX "AlertEvent_userId_orgId_createdAt_idx" ON "AlertEvent"("userId", "orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_alertId_entityId_dedupeKey_key" ON "AlertEvent"("alertId", "entityId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

