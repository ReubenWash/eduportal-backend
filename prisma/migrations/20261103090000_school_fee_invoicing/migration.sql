CREATE TYPE "FeeInvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_structure_items" (
    "id" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "FeeInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "fee_invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_invoice_concessions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_invoice_concessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_transactions" ADD COLUMN "feeInvoiceId" TEXT;

CREATE UNIQUE INDEX "fee_structures_schoolId_classId_termId_key" ON "fee_structures"("schoolId", "classId", "termId");
CREATE INDEX "fee_structures_schoolId_termId_idx" ON "fee_structures"("schoolId", "termId");
CREATE UNIQUE INDEX "fee_structure_items_feeStructureId_categoryId_key" ON "fee_structure_items"("feeStructureId", "categoryId");
CREATE UNIQUE INDEX "fee_invoices_schoolId_invoiceNumber_key" ON "fee_invoices"("schoolId", "invoiceNumber");
CREATE UNIQUE INDEX "fee_invoices_schoolId_studentId_termId_key" ON "fee_invoices"("schoolId", "studentId", "termId");
CREATE INDEX "fee_invoices_schoolId_dueDate_status_idx" ON "fee_invoices"("schoolId", "dueDate", "status");
CREATE INDEX "fee_invoices_studentId_termId_idx" ON "fee_invoices"("studentId", "termId");
CREATE INDEX "fee_invoice_items_invoiceId_idx" ON "fee_invoice_items"("invoiceId");
CREATE INDEX "fee_invoice_concessions_invoiceId_idx" ON "fee_invoice_concessions"("invoiceId");
CREATE INDEX "financial_transactions_feeInvoiceId_idx" ON "financial_transactions"("feeInvoiceId");

ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_invoice_items" ADD CONSTRAINT "fee_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_invoice_items" ADD CONSTRAINT "fee_invoice_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_invoice_concessions" ADD CONSTRAINT "fee_invoice_concessions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_invoice_concessions" ADD CONSTRAINT "fee_invoice_concessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_feeInvoiceId_fkey" FOREIGN KEY ("feeInvoiceId") REFERENCES "fee_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "custom_roles"
SET "permissions" = "permissions" || ARRAY['manage_invoices', 'manage_concessions', 'view_arrears']::TEXT[]
WHERE "name" = 'School Admin';

UPDATE "custom_roles"
SET "permissions" = "permissions" || ARRAY['manage_invoices', 'view_arrears']::TEXT[]
WHERE "name" = 'Accountant';
