-- CreateTable
CREATE TABLE "SavedAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orgName" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "widgets" TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedAudit_userId_idx" ON "SavedAudit"("userId");

-- AddForeignKey
ALTER TABLE "SavedAudit" ADD CONSTRAINT "SavedAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
