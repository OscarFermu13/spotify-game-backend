/*
  Warnings:

  - A unique constraint covering the columns `[dailyDate]` on the table `GameSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "dailyDate" DATE,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'custom';

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_dailyDate_key" ON "GameSession"("dailyDate");
