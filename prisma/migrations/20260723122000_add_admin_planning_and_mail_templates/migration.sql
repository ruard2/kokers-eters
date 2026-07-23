CREATE TABLE "PlanningSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "horizonMonths" INTEGER NOT NULL DEFAULT 1,
  "adminCheckDaysBefore" INTEGER NOT NULL DEFAULT 14,
  "hostMailDaysBefore" INTEGER NOT NULL DEFAULT 21,
  "eaterMailDelayDays" INTEGER NOT NULL DEFAULT 3,
  "reminderDaysAfter" INTEGER NOT NULL DEFAULT 3,
  "renewalCadence" TEXT NOT NULL DEFAULT 'YEAR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailTemplate" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailTemplate_type_key" ON "MailTemplate"("type");
