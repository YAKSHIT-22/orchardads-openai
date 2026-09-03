-- CreateTable
CREATE TABLE "CachedCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adamId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "servingStatus" TEXT,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedAdGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "appleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedAdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedKeyword" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "appleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CachedCampaign_orgId_appleId_key" ON "CachedCampaign"("orgId", "appleId");
CREATE INDEX "CachedCampaign_userId_orgId_idx" ON "CachedCampaign"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedAdGroup_orgId_appleId_key" ON "CachedAdGroup"("orgId", "appleId");
CREATE INDEX "CachedAdGroup_userId_orgId_campaignId_idx" ON "CachedAdGroup"("userId", "orgId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedKeyword_orgId_appleId_key" ON "CachedKeyword"("orgId", "appleId");
CREATE INDEX "CachedKeyword_userId_orgId_campaignId_adGroupId_idx" ON "CachedKeyword"("userId", "orgId", "campaignId", "adGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedReport_cacheKey_key" ON "CachedReport"("cacheKey");
CREATE INDEX "CachedReport_userId_orgId_reportType_idx" ON "CachedReport"("userId", "orgId", "reportType");
