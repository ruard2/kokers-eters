ALTER TABLE "Participant" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Participant"
SET "isGuest" = true
WHERE "communityScope" = 'GUESTS_AND_NEWCOMERS';

UPDATE "Participant"
SET "communityScope" = 'COMMUNITY_WIDE';

ALTER TABLE "Participant" ALTER COLUMN "communityScope" SET DEFAULT 'COMMUNITY_WIDE';
