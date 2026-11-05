-- highlevel-whatsapp: contract WhatsApp delivery status (spec §4.2, §6.4).
-- TRUE once the contact is enrolled in the HighLevel contract workflow; that
-- is "handed to the CRM", not "delivered" or "read". Additive and constant
-- default, so no table rewrite.

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "whatsapp_sent" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: contracts created before the HighLevel integration are treated as
-- resolved (nothing in this database records whether the previous provider
-- sent them), so the "WhatsApp pendiente" indicator only tracks new sends.
-- Staff can still use "Reenviar por WhatsApp" on any of them.
UPDATE "contracts" SET "whatsapp_sent" = true;
