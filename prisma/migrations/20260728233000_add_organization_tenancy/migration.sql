CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "communityToolsId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityToolsAccount" (
  "id" TEXT NOT NULL,
  "communityToolsUserId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityToolsAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Participant" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "MatchRound" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PlanningSettings" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "MailTemplate" ADD COLUMN "organizationId" TEXT;

DROP INDEX "Participant_email_key";
DROP INDEX "MatchRound_month_key";
DROP INDEX "MailTemplate_type_key";

CREATE UNIQUE INDEX "Organization_communityToolsId_key"
  ON "Organization"("communityToolsId");
CREATE UNIQUE INDEX "CommunityToolsAccount_communityToolsUserId_key"
  ON "CommunityToolsAccount"("communityToolsUserId");
CREATE INDEX "CommunityToolsAccount_organizationId_idx"
  ON "CommunityToolsAccount"("organizationId");
CREATE UNIQUE INDEX "Participant_organizationId_email_key"
  ON "Participant"("organizationId", "email");
CREATE INDEX "Participant_organizationId_idx"
  ON "Participant"("organizationId");
CREATE UNIQUE INDEX "MatchRound_organizationId_month_key"
  ON "MatchRound"("organizationId", "month");
CREATE INDEX "MatchRound_organizationId_idx"
  ON "MatchRound"("organizationId");
CREATE UNIQUE INDEX "PlanningSettings_organizationId_key"
  ON "PlanningSettings"("organizationId");
CREATE UNIQUE INDEX "MailTemplate_organizationId_type_key"
  ON "MailTemplate"("organizationId", "type");
CREATE INDEX "MailTemplate_organizationId_idx"
  ON "MailTemplate"("organizationId");

ALTER TABLE "CommunityToolsAccount"
  ADD CONSTRAINT "CommunityToolsAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Participant"
  ADD CONSTRAINT "Participant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchRound"
  ADD CONSTRAINT "MatchRound_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningSettings"
  ADD CONSTRAINT "PlanningSettings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailTemplate"
  ADD CONSTRAINT "MailTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
