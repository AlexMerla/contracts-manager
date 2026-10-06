-- CreateEnum
CREATE TYPE "payment_concept" AS ENUM ('deposit', 'installment', 'settlement', 'other');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "concept" "payment_concept" NOT NULL,
ADD COLUMN     "folio" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payments_folio_key" ON "payments"("folio");
