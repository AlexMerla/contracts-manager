/*
  Warnings:

  - You are about to drop the column `google_id` on the `users` table. All the data in the column will be lost.
  - Made the column `password_hash` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "users_google_id_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "google_id",
ALTER COLUMN "password_hash" SET NOT NULL;
