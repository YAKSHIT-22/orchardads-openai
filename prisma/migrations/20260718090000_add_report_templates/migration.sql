-- AlterEnum
ALTER TYPE "ReportFrequency" ADD VALUE 'MONTHLY';

-- AlterTable
ALTER TABLE "ReportSchedule" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "reportType" SET DEFAULT 'campaign';

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover" JSONB,
    "dateRange" TEXT NOT NULL DEFAULT '30d',
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTemplate_userId_orgId_idx" ON "ReportTemplate"("userId", "orgId");

-- CreateIndex
CREATE INDEX "ReportSchedule_templateId_idx" ON "ReportSchedule"("templateId");

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

