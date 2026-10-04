-- CreateEnum
CREATE TYPE "ManualPaymentMethod" AS ENUM ('MOMO', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "planRenewsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pricePerStudent" DECIMAL(10,2) NOT NULL DEFAULT 4,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "momoNetwork" TEXT,
    "momoNumber" TEXT,
    "momoAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankBranch" TEXT,
    "instructions" TEXT,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "pricePerStudent" DECIMAL(10,2) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amountExpected" DECIMAL(12,2) NOT NULL,
    "amountReceived" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "method" "ManualPaymentMethod" NOT NULL,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "transactionRef" TEXT,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "proofKey" TEXT NOT NULL,
    "proofMime" TEXT NOT NULL,
    "proofName" TEXT NOT NULL,
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_payments_reference_key" ON "school_payments"("reference");
CREATE INDEX "school_payments_schoolId_status_idx" ON "school_payments"("schoolId", "status");
CREATE INDEX "school_payments_status_createdAt_idx" ON "school_payments"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "school_payments" ADD CONSTRAINT "school_payments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_payments" ADD CONSTRAINT "school_payments_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_payments" ADD CONSTRAINT "school_payments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the single settings row (GHS 4 per active student per month)
INSERT INTO "billing_settings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);