-- CreateEnum
CREATE TYPE "public"."ContactType" AS ENUM ('telegram', 'email', 'signal');

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('draft', 'submitted', 'tx_pending', 'tx_confirmed', 'tx_failed');

-- CreateTable
CREATE TABLE "public"."Application" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "contactType" "public"."ContactType" NOT NULL,
    "contactValueEncrypted" TEXT NOT NULL,
    "txHash" TEXT,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_walletAddress_key" ON "public"."Application"("walletAddress");
