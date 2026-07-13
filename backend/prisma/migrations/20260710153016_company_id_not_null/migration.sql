/*
  Warnings:

  - Made the column `companyId` on table `Employee` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Notification` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `OfficeExpense` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Project` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Supplier` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OfficeExpense" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
