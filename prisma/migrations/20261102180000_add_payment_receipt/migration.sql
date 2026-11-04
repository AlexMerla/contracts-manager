-- payment-receipt: frozen receipt per payment (spec §6.11, §10).
-- `receipt_token` has a VOLATILE default, so Postgres rewrites the table and
-- evaluates it once per existing row: every existing payment gets its own
-- distinct token and the column can be NOT NULL immediately. Two built-in
-- gen_random_uuid() calls (Postgres 13+, no pgcrypto) = 244 random bits.
-- The app always supplies its own token on insert.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receipt_token" TEXT NOT NULL DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text),
ADD COLUMN     "receipt_snapshot" JSONB,
ADD COLUMN     "receipt_email_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receipt_whatsapp_sent" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_token_key" ON "payments"("receipt_token");
