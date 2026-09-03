-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerifiedStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'BLOCKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('trial', 'starter', 'growth', 'scale', 'expired');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'INVALID', 'DISABLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "RecommendationKind" AS ENUM ('SERVING_ISSUE', 'REVIEW_ISSUE', 'WASTED_SPEND', 'BUDGET_EXHAUSTED', 'UNDERFUNDED_WINNER', 'OVERSPENDING_LOSER', 'BID_TOO_HIGH', 'BID_TOO_LOW', 'CREATIVE_FATIGUE', 'TRACKING_GAP', 'ORPHANED_ENTITY', 'PACING_RISK');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('ADVISORY', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'APPROVED', 'APPLIED', 'DISMISSED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTING', 'EXECUTED', 'FAILED', 'ROLLED_BACK', 'REJECTED');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('METRIC', 'BUDGET', 'ANOMALY', 'SERVING', 'REVIEW');

-- CreateEnum
CREATE TYPE "AlertScope" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'ADGROUP', 'AD');

-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('SPEND', 'IMPRESSIONS', 'CLICKS', 'CTR', 'CPC', 'CPM', 'CONVERSIONS', 'CPA', 'CONVERSION_RATE', 'REVENUE', 'ROAS');

-- CreateEnum
CREATE TYPE "AlertComparator" AS ENUM ('ABOVE', 'BELOW', 'CHANGE_UP', 'CHANGE_DOWN');

-- CreateEnum
CREATE TYPE "AlertAction" AS ENUM ('NOTIFY', 'PAUSE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('NEW', 'READ', 'SNOOZED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "StrategyScope" AS ENUM ('CAMPAIGN', 'ADGROUP', 'AD', 'GEO');

-- CreateEnum
CREATE TYPE "StrategyFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "StrategyRunMode" AS ENUM ('PREVIEW', 'APPLY', 'AUTO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "verified" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorPending" TEXT,
    "twoFactorBackupCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" "PlanId" NOT NULL DEFAULT 'trial',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meter" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenAiAdsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "apiKey" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "accountUrl" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "reviewStatus" TEXT,
    "reviewReason" TEXT,
    "accountStatus" TEXT,
    "conversionValueMicros" BIGINT,
    "capabilities" JSONB,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenAiAdsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedCampaign" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "biddingType" TEXT,
    "objective" TEXT,
    "billingEventType" TEXT,
    "mode" TEXT,
    "lifetimeBudgetMicros" BIGINT,
    "dailyBudgetMicros" BIGINT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "servingIssues" TEXT[],
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedAdGroup" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "billingEventType" TEXT,
    "maxBidMicros" BIGINT,
    "contextHints" TEXT[],
    "servingIssues" TEXT[],
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedAdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedAd" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "creativeType" TEXT,
    "title" TEXT,
    "body" TEXT,
    "targetUrl" TEXT,
    "imageUrl" TEXT,
    "fileId" TEXT,
    "reviewStatus" TEXT,
    "reviewReason" TEXT,
    "reviewScreenshot" TEXT,
    "servingIssues" TEXT[],
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "spendMicros" BIGINT NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "viewThroughConversions" INTEGER NOT NULL DEFAULT 0,
    "segmentType" TEXT NOT NULL DEFAULT '',
    "segmentValue" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "campaignsSynced" INTEGER NOT NULL DEFAULT 0,
    "adGroupsSynced" INTEGER NOT NULL DEFAULT 0,
    "adsSynced" INTEGER NOT NULL DEFAULT 0,
    "factsWritten" INTEGER NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "RecommendationKind" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "field" TEXT,
    "currentValue" TEXT,
    "proposedValue" TEXT,
    "changePercent" DOUBLE PRECISION,
    "estimatedImpactMicros" BIGINT,
    "confidence" DOUBLE PRECISION,
    "riskBand" "RiskBand" NOT NULL DEFAULT 'ADVISORY',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedAction" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "status" "ActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "idempotencyKey" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "adAccountId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "entityType" TEXT,
    "entityId" TEXT,
    "entityName" TEXT,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "widgets" TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedDashboard" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dateRange" TEXT NOT NULL DEFAULT '30d',
    "widgets" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
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
    "adAccountId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover" JSONB,
    "dateRange" TEXT NOT NULL DEFAULT '30d',
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'campaign',
    "templateId" TEXT,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "lookbackDays" INTEGER NOT NULL DEFAULT 7,
    "frequency" "ReportFrequency" NOT NULL DEFAULT 'WEEKLY',
    "recipients" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "StrategyScope" NOT NULL,
    "campaignIds" TEXT[],
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "rules" JSONB NOT NULL,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "StrategyFrequency" NOT NULL DEFAULT 'WEEKLY',
    "autoApply" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "maxChangePercent" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "maxActionsPerRun" INTEGER NOT NULL DEFAULT 20,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "mode" "StrategyRunMode" NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "suggestions" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_trialEndsAt_idx" ON "Subscription"("status", "trialEndsAt");

-- CreateIndex
CREATE INDEX "UsageRecord_userId_period_idx" ON "UsageRecord"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_userId_meter_period_key" ON "UsageRecord"("userId", "meter", "period");

-- CreateIndex
CREATE INDEX "OpenAiAdsConnection_userId_idx" ON "OpenAiAdsConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenAiAdsConnection_userId_adAccountId_key" ON "OpenAiAdsConnection"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "CachedCampaign_userId_adAccountId_idx" ON "CachedCampaign"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "CachedCampaign_connectionId_status_idx" ON "CachedCampaign"("connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CachedCampaign_connectionId_externalId_key" ON "CachedCampaign"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "CachedAdGroup_userId_adAccountId_idx" ON "CachedAdGroup"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "CachedAdGroup_campaignId_status_idx" ON "CachedAdGroup"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CachedAdGroup_connectionId_externalId_key" ON "CachedAdGroup"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "CachedAd_userId_adAccountId_idx" ON "CachedAd"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "CachedAd_adGroupId_status_idx" ON "CachedAd"("adGroupId", "status");

-- CreateIndex
CREATE INDEX "CachedAd_connectionId_reviewStatus_idx" ON "CachedAd"("connectionId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CachedAd_connectionId_externalId_key" ON "CachedAd"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "MetricFact_userId_adAccountId_date_idx" ON "MetricFact"("userId", "adAccountId", "date");

-- CreateIndex
CREATE INDEX "MetricFact_adAccountId_entityType_date_idx" ON "MetricFact"("adAccountId", "entityType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetricFact_adAccountId_entityType_entityId_date_segmentType_key" ON "MetricFact"("adAccountId", "entityType", "entityId", "date", "segmentType", "segmentValue");

-- CreateIndex
CREATE INDEX "SyncRun_connectionId_startedAt_idx" ON "SyncRun"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_userId_adAccountId_startedAt_idx" ON "SyncRun"("userId", "adAccountId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CachedReport_cacheKey_key" ON "CachedReport"("cacheKey");

-- CreateIndex
CREATE INDEX "CachedReport_userId_adAccountId_reportType_idx" ON "CachedReport"("userId", "adAccountId", "reportType");

-- CreateIndex
CREATE INDEX "Recommendation_userId_adAccountId_status_idx" ON "Recommendation"("userId", "adAccountId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_userId_adAccountId_kind_idx" ON "Recommendation"("userId", "adAccountId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_userId_adAccountId_dedupeKey_key" ON "Recommendation"("userId", "adAccountId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProposedAction_recommendationId_key" ON "ProposedAction"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposedAction_idempotencyKey_key" ON "ProposedAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProposedAction_userId_adAccountId_status_idx" ON "ProposedAction"("userId", "adAccountId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adAccountId_createdAt_idx" ON "AuditLog"("adAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SavedAudit_userId_idx" ON "SavedAudit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedDashboard_token_key" ON "SharedDashboard"("token");

-- CreateIndex
CREATE INDEX "SharedDashboard_userId_idx" ON "SharedDashboard"("userId");

-- CreateIndex
CREATE INDEX "Alert_userId_adAccountId_idx" ON "Alert"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "AlertEvent_userId_adAccountId_status_idx" ON "AlertEvent"("userId", "adAccountId", "status");

-- CreateIndex
CREATE INDEX "AlertEvent_userId_adAccountId_createdAt_idx" ON "AlertEvent"("userId", "adAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_alertId_entityId_dedupeKey_key" ON "AlertEvent"("alertId", "entityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ReportTemplate_userId_adAccountId_idx" ON "ReportTemplate"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "ReportSchedule_userId_adAccountId_idx" ON "ReportSchedule"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "ReportSchedule_templateId_idx" ON "ReportSchedule"("templateId");

-- CreateIndex
CREATE INDEX "Strategy_userId_adAccountId_idx" ON "Strategy"("userId", "adAccountId");

-- CreateIndex
CREATE INDEX "StrategyRun_strategyId_createdAt_idx" ON "StrategyRun"("strategyId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyRun_userId_adAccountId_createdAt_idx" ON "StrategyRun"("userId", "adAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAiAdsConnection" ADD CONSTRAINT "OpenAiAdsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedCampaign" ADD CONSTRAINT "CachedCampaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OpenAiAdsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedAdGroup" ADD CONSTRAINT "CachedAdGroup_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OpenAiAdsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedAdGroup" ADD CONSTRAINT "CachedAdGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CachedCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedAd" ADD CONSTRAINT "CachedAd_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OpenAiAdsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedAd" ADD CONSTRAINT "CachedAd_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "CachedAdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OpenAiAdsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAudit" ADD CONSTRAINT "SavedAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedDashboard" ADD CONSTRAINT "SharedDashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

