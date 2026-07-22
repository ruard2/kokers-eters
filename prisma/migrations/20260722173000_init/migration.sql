CREATE TYPE "ParticipationMode" AS ENUM ('EAT', 'HOST', 'BOTH');
CREATE TYPE "Frequency" AS ENUM ('BIWEEKLY', 'MONTHLY', 'QUARTERLY');
CREATE TYPE "CommunityScope" AS ENUM ('COMMUNITY_WIDE', 'GUESTS_AND_NEWCOMERS', 'BOTH');
CREATE TYPE "GatheringType" AS ENUM ('MEAL', 'COFFEE_TEA', 'BOTH');
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'HOST_MAILS_SENT', 'COMPLETE');
CREATE TYPE "MatchStatus" AS ENUM ('DRAFT', 'HOST_INVITED', 'HOST_RESPONDED', 'EATER_INVITED', 'EATER_CONFIRMED', 'FALLBACK_SENT', 'CANCELLED');

CREATE TABLE "Participant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "mode" "ParticipationMode" NOT NULL DEFAULT 'BOTH',
  "comingWithCount" INTEGER NOT NULL DEFAULT 1,
  "hostCapacity" INTEGER,
  "eaterFrequency" "Frequency",
  "hostFrequency" "Frequency",
  "allergies" TEXT,
  "address" TEXT,
  "cannotEatDays" TEXT,
  "cannotHostDays" TEXT,
  "communityScope" "CommunityScope" NOT NULL DEFAULT 'BOTH',
  "gatheringType" "GatheringType" NOT NULL DEFAULT 'BOTH',
  "cookingPlan" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "preferenceToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchRound" (
  "id" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "status" "RoundStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealMatch" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "eaterId" TEXT NOT NULL,
  "partySize" INTEGER NOT NULL,
  "hostToken" TEXT NOT NULL,
  "eaterToken" TEXT NOT NULL,
  "status" "MatchStatus" NOT NULL DEFAULT 'DRAFT',
  "proposedDates" JSONB,
  "chosenDate" TIMESTAMP(3),
  "hostNote" TEXT,
  "hostInvitedAt" TIMESTAMP(3),
  "hostRespondedAt" TIMESTAMP(3),
  "eaterInvitedAt" TIMESTAMP(3),
  "eaterRespondedAt" TIMESTAMP(3),
  "fallbackSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MealMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundOptOut" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundOptOut_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLog" (
  "id" TEXT NOT NULL,
  "participantId" TEXT,
  "matchId" TEXT,
  "type" TEXT NOT NULL,
  "contextKey" TEXT,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "providerId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Participant_email_key" ON "Participant"("email");
CREATE UNIQUE INDEX "Participant_preferenceToken_key" ON "Participant"("preferenceToken");
CREATE UNIQUE INDEX "MatchRound_month_key" ON "MatchRound"("month");
CREATE UNIQUE INDEX "MealMatch_hostToken_key" ON "MealMatch"("hostToken");
CREATE UNIQUE INDEX "MealMatch_eaterToken_key" ON "MealMatch"("eaterToken");
CREATE UNIQUE INDEX "MealMatch_roundId_hostId_eaterId_key" ON "MealMatch"("roundId", "hostId", "eaterId");
CREATE INDEX "MealMatch_roundId_idx" ON "MealMatch"("roundId");
CREATE INDEX "MealMatch_hostId_idx" ON "MealMatch"("hostId");
CREATE INDEX "MealMatch_eaterId_idx" ON "MealMatch"("eaterId");
CREATE INDEX "MealMatch_status_idx" ON "MealMatch"("status");
CREATE UNIQUE INDEX "RoundOptOut_participantId_month_key" ON "RoundOptOut"("participantId", "month");
CREATE INDEX "RoundOptOut_month_idx" ON "RoundOptOut"("month");
CREATE INDEX "EmailLog_participantId_idx" ON "EmailLog"("participantId");
CREATE INDEX "EmailLog_matchId_idx" ON "EmailLog"("matchId");
CREATE INDEX "EmailLog_contextKey_idx" ON "EmailLog"("contextKey");

ALTER TABLE "MealMatch" ADD CONSTRAINT "MealMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MatchRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealMatch" ADD CONSTRAINT "MealMatch_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealMatch" ADD CONSTRAINT "MealMatch_eaterId_fkey" FOREIGN KEY ("eaterId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundOptOut" ADD CONSTRAINT "RoundOptOut_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "MealMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
