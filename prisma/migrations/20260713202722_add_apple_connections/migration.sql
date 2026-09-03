-- CreateTable
CREATE TABLE "AppleConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "clientId" TEXT,
    "teamId" TEXT,
    "keyId" TEXT,
    "clientSecret" TEXT,
    "accessToken" TEXT,
    "clientSecretExpiresAt" TIMESTAMP(3),
    "accessTokenExpiresAt" TIMESTAMP(3),
    "orgIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppleConnection_userId_idx" ON "AppleConnection"("userId");

-- AddForeignKey
ALTER TABLE "AppleConnection" ADD CONSTRAINT "AppleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate every existing single-credential row into the new connections table
-- as that user's first connection (orgIds repopulate on the next /acls fetch).
INSERT INTO "AppleConnection" (
    "id", "userId", "privateKey", "publicKey", "clientId", "teamId", "keyId",
    "clientSecret", "accessToken", "clientSecretExpiresAt", "accessTokenExpiresAt",
    "orgIds", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, "userId", "privateKey", "publicKey", "clientId", "teamId", "keyId",
    "clientSecret", "accessToken", "clientSecretExpiresAt", "accessTokenExpiresAt",
    ARRAY[]::text[], "createdAt", "updatedAt"
FROM "UserAccessInfo";
