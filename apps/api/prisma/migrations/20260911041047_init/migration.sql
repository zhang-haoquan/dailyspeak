-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('draft', 'review', 'published', 'archived');

-- CreateEnum
CREATE TYPE "LearningMode" AS ENUM ('new', 'review');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "domains" TEXT[],
    "daily_count" INTEGER NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_cards" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "scene_text" TEXT NOT NULL,
    "scene_zh" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "prompt_zh" TEXT NOT NULL,
    "reference_answer" TEXT,
    "difficulty" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scenario_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "repeat_score" INTEGER,
    "answer_score" INTEGER,
    "composite" INTEGER,
    "done_at" TIMESTAMPTZ(6) NOT NULL,
    "mode" "LearningMode" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_schedule" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "last_score" INTEGER NOT NULL DEFAULT 0,
    "times_reviewed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "today_plan" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date_key" VARCHAR(10) NOT NULL,
    "tasks" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "today_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "scenario_cards_status_domain_idx" ON "scenario_cards"("status", "domain");

-- CreateIndex
CREATE INDEX "user_progress_user_id_done_at_idx" ON "user_progress"("user_id", "done_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_card_id_key" ON "user_progress"("user_id", "card_id");

-- CreateIndex
CREATE INDEX "review_schedule_user_id_due_at_idx" ON "review_schedule"("user_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_schedule_user_id_card_id_key" ON "review_schedule"("user_id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "today_plan_user_id_date_key_key" ON "today_plan"("user_id", "date_key");

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "scenario_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedule" ADD CONSTRAINT "review_schedule_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "scenario_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
