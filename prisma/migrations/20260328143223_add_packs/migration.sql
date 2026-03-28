-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "packId" TEXT;

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "playlistUrl" TEXT NOT NULL,
    "trackCount" INTEGER NOT NULL DEFAULT 5,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "price" DECIMAL(65,30),
    "currency" TEXT DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'free',
    "priceCharged" DECIMAL(65,30),

    CONSTRAINT "UserPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pack_slug_key" ON "Pack"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserPack_userId_packId_key" ON "UserPack"("userId", "packId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPack" ADD CONSTRAINT "UserPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPack" ADD CONSTRAINT "UserPack_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
