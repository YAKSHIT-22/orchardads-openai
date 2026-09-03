-- CreateEnum
CREATE TYPE "StrategyScope" AS ENUM ('CAMPAIGN', 'ADGROUP', 'AD', 'KEYWORD', 'GEO');

-- CreateEnum
CREATE TYPE "StrategyFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "StrategyRunMode" AS ENUM ('PREVIEW', 'APPLY', 'AUTO');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgName" TEXT,
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
    "orgId" TEXT NOT NULL,
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
CREATE INDEX "Strategy_userId_orgId_idx" ON "Strategy"("userId", "orgId");

-- CreateIndex
CREATE INDEX "StrategyRun_strategyId_createdAt_idx" ON "StrategyRun"("strategyId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyRun_userId_orgId_createdAt_idx" ON "StrategyRun"("userId", "orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

