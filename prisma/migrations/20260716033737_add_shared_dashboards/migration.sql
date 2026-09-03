-- CreateTable
CREATE TABLE "SharedDashboard" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgName" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "SharedDashboard_token_key" ON "SharedDashboard"("token");

-- CreateIndex
CREATE INDEX "SharedDashboard_userId_idx" ON "SharedDashboard"("userId");

-- AddForeignKey
ALTER TABLE "SharedDashboard" ADD CONSTRAINT "SharedDashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
