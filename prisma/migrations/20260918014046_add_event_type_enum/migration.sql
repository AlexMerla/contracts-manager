/*
  Warnings:

  - Changed the type of `event_type` on the `contracts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('quinceanera', 'wedding', 'birthday', 'graduation', 'posada', 'other');

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "event_type",
ADD COLUMN     "event_type" "event_type" NOT NULL;
