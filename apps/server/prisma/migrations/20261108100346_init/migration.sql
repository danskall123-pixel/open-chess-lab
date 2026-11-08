CREATE TYPE "Role" AS ENUM ('user', 'moderator');

CREATE TYPE "Speed" AS ENUM ('bullet', 'blitz', 'rapid', 'classical');

CREATE TYPE "GameStatus" AS ENUM ('ongoing', 'finished', 'aborted');

CREATE TYPE "FlagStatus" AS ENUM ('open', 'dismissed', 'confirmed');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "markedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rating" (
    "userId" TEXT NOT NULL,
    "speed" "Speed" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("userId","speed")
);

CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "speed" "Speed" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "gameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "whiteUserId" TEXT,
    "blackUserId" TEXT,
    "whiteGuestId" TEXT,
    "blackGuestId" TEXT,
    "whiteName" TEXT NOT NULL,
    "blackName" TEXT NOT NULL,
    "rated" BOOLEAN NOT NULL,
    "speed" "Speed" NOT NULL,
    "initialSeconds" INTEGER NOT NULL,
    "incrementSeconds" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "initialFen" TEXT NOT NULL,
    "moves" TEXT NOT NULL DEFAULT '',
    "status" "GameStatus" NOT NULL DEFAULT 'ongoing',
    "result" TEXT,
    "termination" TEXT,
    "pgn" TEXT,
    "whiteRatingBefore" INTEGER,
    "blackRatingBefore" INTEGER,
    "whiteRatingDiff" INTEGER,
    "blackRatingDiff" INTEGER,
    "whiteClockMs" INTEGER NOT NULL,
    "blackClockMs" INTEGER NOT NULL,
    "clockRunning" TEXT,
    "turnStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "fairPlayCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FairPlayFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "analyzedMoves" INTEGER NOT NULL,
    "topMoveMatches" INTEGER NOT NULL,
    "topMoveRate" DOUBLE PRECISION NOT NULL,
    "averageCentipawnLoss" DOUBLE PRECISION NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FairPlayFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RatingRefund" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "markedUserId" TEXT NOT NULL,
    "speed" "Speed" NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

CREATE INDEX "Rating_speed_rating_idx" ON "Rating"("speed", "rating");

CREATE INDEX "RatingHistory_userId_speed_createdAt_idx" ON "RatingHistory"("userId", "speed", "createdAt");

CREATE INDEX "Game_whiteUserId_startedAt_idx" ON "Game"("whiteUserId", "startedAt");

CREATE INDEX "Game_blackUserId_startedAt_idx" ON "Game"("blackUserId", "startedAt");

CREATE INDEX "Game_status_idx" ON "Game"("status");

CREATE INDEX "FairPlayFlag_status_createdAt_idx" ON "FairPlayFlag"("status", "createdAt");

CREATE UNIQUE INDEX "FairPlayFlag_gameId_userId_key" ON "FairPlayFlag"("gameId", "userId");

CREATE UNIQUE INDEX "RatingRefund_gameId_userId_key" ON "RatingRefund"("gameId", "userId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Game" ADD CONSTRAINT "Game_whiteUserId_fkey" FOREIGN KEY ("whiteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Game" ADD CONSTRAINT "Game_blackUserId_fkey" FOREIGN KEY ("blackUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FairPlayFlag" ADD CONSTRAINT "FairPlayFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FairPlayFlag" ADD CONSTRAINT "FairPlayFlag_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FairPlayFlag" ADD CONSTRAINT "FairPlayFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RatingRefund" ADD CONSTRAINT "RatingRefund_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RatingRefund" ADD CONSTRAINT "RatingRefund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
