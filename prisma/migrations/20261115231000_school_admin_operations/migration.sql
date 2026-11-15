CREATE TABLE "library_books" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "category" TEXT,
    "isbn" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "stopCount" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_entries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "library_books_schoolId_isbn_key" ON "library_books"("schoolId", "isbn");
CREATE INDEX "library_books_schoolId_title_idx" ON "library_books"("schoolId", "title");
CREATE INDEX "transport_routes_schoolId_status_idx" ON "transport_routes"("schoolId", "status");
CREATE UNIQUE INDEX "payroll_entries_schoolId_staffId_period_key" ON "payroll_entries"("schoolId", "staffId", "period");
CREATE INDEX "payroll_entries_schoolId_period_status_idx" ON "payroll_entries"("schoolId", "period", "status");

ALTER TABLE "library_books" ADD CONSTRAINT "library_books_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
