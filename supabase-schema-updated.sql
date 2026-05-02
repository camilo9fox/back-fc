-- =============================================================
--  StudyAI  ·  Full Schema  (v5)
--  Changes from v1:
--    · flashcards.options column removed (classic Q/A format)
--    · flashcards.category_id is now NOT NULL
--    · NEW: quizzes + quiz_questions tables
--    · NEW: true_false_sets + true_false_questions tables
--  Changes from v2:
--    · NEW: quiz_attempts table
--    · NEW: true_false_attempts table
--  Changes from v3:
--    · NEW: Library / sharing feature
--      - is_public flag on categories, flashcards, quizzes, true_false_sets
--      - Publishing a category propagates is_public to all its content
--      - RLS updated: own OR public content is readable
--      - Partial indexes for efficient public-content queries
--  Changes from v4:
--    · NEW: flashcard_reviews table (SM-2 spaced repetition state)
--    · NEW: game_scores table (arcade game records — Survival mode)
-- =============================================================

-- ────────────────────────────────────────────
-- RESET: Drop everything in reverse dependency order
-- ────────────────────────────────────────────

-- Policies must be dropped BEFORE their tables (tables must still exist)
DROP POLICY IF EXISTS "Users can read their own categories"          ON categories;
DROP POLICY IF EXISTS "Users can read their own flashcards"          ON flashcards;
DROP POLICY IF EXISTS "Users can read their own quizzes"             ON quizzes;
DROP POLICY IF EXISTS "Users can read their own tf sets"             ON true_false_sets;
DROP POLICY IF EXISTS "Users can read their quiz questions"          ON quiz_questions;
DROP POLICY IF EXISTS "Users can read their tf questions"            ON true_false_questions;
DROP POLICY IF EXISTS "Read own or public categories"                ON categories;
DROP POLICY IF EXISTS "Read own or public flashcards"                ON flashcards;
DROP POLICY IF EXISTS "Read own or public quizzes"                   ON quizzes;
DROP POLICY IF EXISTS "Read own or public tf sets"                   ON true_false_sets;
DROP POLICY IF EXISTS "Read quiz questions of own or public quiz"    ON quiz_questions;
DROP POLICY IF EXISTS "Read tf questions of own or public set"       ON true_false_questions;

-- Standalone tables (no child dependencies)
-- Policies for these are dropped automatically via CASCADE
DROP TABLE IF EXISTS game_scores          CASCADE;
DROP TABLE IF EXISTS flashcard_reviews    CASCADE;
DROP TABLE IF EXISTS generation_jobs      CASCADE;
DROP TABLE IF EXISTS ai_user_quotas       CASCADE;

-- Attempt tables first (no child dependencies)
DROP TABLE IF EXISTS quiz_attempts        CASCADE;
DROP TABLE IF EXISTS true_false_attempts  CASCADE;
DROP TABLE IF EXISTS flashcard_sessions   CASCADE;

-- Questions / child tables (depend on parent tables)
DROP TABLE IF EXISTS true_false_questions CASCADE;
DROP TABLE IF EXISTS quiz_questions       CASCADE;
DROP TABLE IF EXISTS flashcards           CASCADE;
DROP TABLE IF EXISTS study_guides         CASCADE;

-- Parent tables
DROP TABLE IF EXISTS true_false_sets CASCADE;
DROP TABLE IF EXISTS quizzes          CASCADE;
DROP TABLE IF EXISTS categories       CASCADE;

-- Triggers are dropped automatically with their tables via CASCADE.
-- Drop the shared trigger function last.
DROP FUNCTION IF EXISTS consume_ai_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ────────────────────────────────────────────
-- Helper: updated_at trigger function
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ────────────────────────────────────────────
-- CATEGORIES
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id    ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON categories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_public     ON categories(created_at DESC) WHERE is_public = true;

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or public categories"        ON categories FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert their own categories" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own categories" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own categories" ON categories FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- FLASHCARDS  (classic Q/A — no options)
-- category_id is required (NOT NULL)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id      ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_category_id  ON flashcards(category_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_source       ON flashcards(source);
CREATE INDEX IF NOT EXISTS idx_flashcards_created_at   ON flashcards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_created ON flashcards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_category ON flashcards(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_public        ON flashcards(category_id, created_at DESC) WHERE is_public = true;

CREATE TRIGGER update_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or public flashcards"        ON flashcards FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert their own flashcards" ON flashcards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flashcards" ON flashcards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flashcards" ON flashcards FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- QUIZZES  (cuestionarios de alternativas)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id     ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_category_id ON quizzes(category_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at  ON quizzes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_public      ON quizzes(created_at DESC) WHERE is_public = true;

CREATE TRIGGER update_quizzes_updated_at
    BEFORE UPDATE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or public quizzes"        ON quizzes FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert their own quizzes" ON quizzes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own quizzes" ON quizzes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own quizzes" ON quizzes FOR DELETE USING (auth.uid() = user_id);

-- Quiz questions
-- options: JSONB array of strings — all alternatives including the correct one
CREATE TABLE IF NOT EXISTS quiz_questions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id        UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  options        JSONB NOT NULL,        -- e.g. ["Opción A","Opción B","Opción C","Opción D"]
  correct_answer TEXT NOT NULL,         -- must be one of the options values
  explanation    TEXT,                  -- optional explanation shown after answering
  order_index    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order   ON quiz_questions(quiz_id, order_index);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- Questions inherit access through their parent quiz (join-based check)
CREATE POLICY "Read quiz questions of own or public quiz" ON quiz_questions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_id AND (q.user_id = auth.uid() OR q.is_public = true))
    );

CREATE POLICY "Users can insert their quiz questions" ON quiz_questions
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid())
    );

CREATE POLICY "Users can update their quiz questions" ON quiz_questions
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid())
    );

CREATE POLICY "Users can delete their quiz questions" ON quiz_questions
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid())
    );

-- ────────────────────────────────────────────
-- TRUE / FALSE SETS
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS true_false_sets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tf_sets_user_id     ON true_false_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_tf_sets_category_id ON true_false_sets(category_id);
CREATE INDEX IF NOT EXISTS idx_tf_sets_created_at  ON true_false_sets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tf_sets_public      ON true_false_sets(created_at DESC) WHERE is_public = true;

CREATE TRIGGER update_true_false_sets_updated_at
    BEFORE UPDATE ON true_false_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE true_false_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or public tf sets"        ON true_false_sets FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert their own tf sets" ON true_false_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tf sets" ON true_false_sets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tf sets" ON true_false_sets FOR DELETE USING (auth.uid() = user_id);

-- True/False questions
CREATE TABLE IF NOT EXISTS true_false_questions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  set_id      UUID NOT NULL REFERENCES true_false_sets(id) ON DELETE CASCADE,
  statement   TEXT NOT NULL,   -- the statement the user must judge true or false
  is_true     BOOLEAN NOT NULL,
  explanation TEXT,            -- optional explanation shown after answering
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tf_questions_set_id ON true_false_questions(set_id);
CREATE INDEX IF NOT EXISTS idx_tf_questions_order  ON true_false_questions(set_id, order_index);

ALTER TABLE true_false_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read tf questions of own or public set" ON true_false_questions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM true_false_sets s WHERE s.id = set_id AND (s.user_id = auth.uid() OR s.is_public = true))
    );

CREATE POLICY "Users can insert their tf questions" ON true_false_questions
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM true_false_sets s WHERE s.id = set_id AND s.user_id = auth.uid())
    );

CREATE POLICY "Users can update their tf questions" ON true_false_questions
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM true_false_sets s WHERE s.id = set_id AND s.user_id = auth.uid())
    );

CREATE POLICY "Users can delete their tf questions" ON true_false_questions
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM true_false_sets s WHERE s.id = set_id AND s.user_id = auth.uid())
    );

-- =============================================================
-- MIGRATION SCRIPT  (run this if upgrading from v1/v2/v3)
-- =============================================================
-- ── v1 → v2 / v3 ─────────────────────────────────────────────────────────────
-- Step 1: ensure every flashcard has a category (create a "General" default)
INSERT INTO categories (user_id, title, description)
SELECT DISTINCT user_id, 'General', 'Categoría general'
FROM flashcards
WHERE category_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE flashcards f
SET category_id = (
  SELECT id FROM categories c
  WHERE c.user_id = f.user_id AND c.title = 'General'
  LIMIT 1
)
WHERE f.category_id IS NULL;

-- Step 2: remove options column and make category_id required
ALTER TABLE flashcards DROP COLUMN IF EXISTS options;
ALTER TABLE flashcards ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE flashcards DROP CONSTRAINT IF EXISTS flashcards_category_id_fkey;
ALTER TABLE flashcards ADD CONSTRAINT flashcards_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;

-- ── v3 → v4: Library / sharing feature ───────────────────────────────────────
-- Step 3: add is_public columns
ALTER TABLE categories      ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE flashcards      ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quizzes         ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE true_false_sets ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Step 4: add partial indexes for public content
CREATE INDEX IF NOT EXISTS idx_categories_public ON categories(created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_flashcards_public  ON flashcards(category_id, created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_quizzes_public     ON quizzes(created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_tf_sets_public     ON true_false_sets(created_at DESC) WHERE is_public = true;

-- ────────────────────────────────────────────
-- STUDY GUIDES
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_guides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_guides_user_id     ON study_guides(user_id);
CREATE INDEX IF NOT EXISTS idx_study_guides_category_id ON study_guides(category_id);
CREATE INDEX IF NOT EXISTS idx_study_guides_created_at  ON study_guides(created_at DESC);

CREATE TRIGGER update_study_guides_updated_at
    BEFORE UPDATE ON study_guides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE study_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own study guides"   ON study_guides FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own study guides" ON study_guides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own study guides" ON study_guides FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own study guides" ON study_guides FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- QUIZ ATTEMPTS
-- Records each completed quiz session for history and stats.
-- quiz_id is nullable so draft sessions can also be recorded.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id          UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
  score            INTEGER NOT NULL CHECK (score >= 0),
  total_questions  INTEGER NOT NULL CHECK (total_questions > 0),
  completed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id      ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id      ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed_at ON quiz_attempts(user_id, completed_at DESC);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own quiz attempts"   ON quiz_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own quiz attempts" ON quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- TRUE/FALSE ATTEMPTS
-- Records each completed true/false session.
-- set_id is nullable so draft sessions can also be recorded.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS true_false_attempts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_id           UUID REFERENCES true_false_sets(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
  score            INTEGER NOT NULL CHECK (score >= 0),
  total_questions  INTEGER NOT NULL CHECK (total_questions > 0),
  completed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tf_attempts_user_id      ON true_false_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_tf_attempts_set_id       ON true_false_attempts(set_id);
CREATE INDEX IF NOT EXISTS idx_tf_attempts_completed_at ON true_false_attempts(user_id, completed_at DESC);

ALTER TABLE true_false_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own tf attempts"   ON true_false_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tf attempts" ON true_false_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- FLASHCARD SESSIONS
-- Records each self-assessed flashcard study session.
-- category_id is nullable to support "all cards" sessions across categories.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_sessions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id    UUID REFERENCES categories(id) ON DELETE SET NULL,
  cards_known    INTEGER NOT NULL CHECK (cards_known >= 0),
  cards_unknown  INTEGER NOT NULL CHECK (cards_unknown >= 0),
  total_cards    INTEGER NOT NULL CHECK (total_cards > 0),
  completed_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fc_sessions_user_id      ON flashcard_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fc_sessions_completed_at ON flashcard_sessions(user_id, completed_at DESC);

ALTER TABLE flashcard_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own fc sessions"   ON flashcard_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fc sessions" ON flashcard_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- FLASHCARD REVIEWS  (SM-2 spaced repetition state)
-- One row per (user, flashcard) pair.
-- ease_factor:    SM-2 easiness factor, starts at 2.5, min 1.3
-- interval_days:  current review interval in days
-- repetitions:    consecutive successful reviews (resets on fail)
-- next_review_at: timestamp of next scheduled review (NULL = new / never reviewed)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id    UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  ease_factor     NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  interval_days   INTEGER NOT NULL DEFAULT 0,
  repetitions     INTEGER NOT NULL DEFAULT 0,
  next_review_at  TIMESTAMP WITH TIME ZONE,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (user_id, flashcard_id)
);

CREATE INDEX IF NOT EXISTS idx_fc_reviews_user_id       ON flashcard_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_fc_reviews_flashcard_id  ON flashcard_reviews(flashcard_id);
CREATE INDEX IF NOT EXISTS idx_fc_reviews_due           ON flashcard_reviews(user_id, next_review_at ASC)
  WHERE next_review_at IS NOT NULL;

ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own fc reviews"
  ON flashcard_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fc reviews"
  ON flashcard_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own fc reviews"
  ON flashcard_reviews FOR UPDATE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- GAME SCORES
-- Persists arcade game records (Survival, etc.) per user.
-- category_id is nullable — records can span all categories.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_scores (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type    TEXT NOT NULL CHECK (game_type IN ('survival')),
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  score        INTEGER NOT NULL CHECK (score >= 0),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user_id     ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_type   ON game_scores(user_id, game_type);
CREATE INDEX IF NOT EXISTS idx_game_scores_completed_at ON game_scores(user_id, completed_at DESC);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own game scores"   ON game_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own game scores" ON game_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── v4 → v5: SM-2 spaced repetition + game scores ─────────────────────
-- (flashcard_reviews and game_scores are new tables — no ALTER needed)
-- Run the full CREATE TABLE blocks above if upgrading from v4.
-- =============================================================
-- -- v5 ? v6: Persist generation jobs ----------------------------------
-- Run this block when upgrading from v5.

CREATE TABLE IF NOT EXISTS generation_jobs (
  id          UUID    NOT NULL PRIMARY KEY,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'queued',
  stage       TEXT,
  percent     INTEGER DEFAULT 0,
  metadata    JSONB,
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id     ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_expires_at  ON generation_jobs(expires_at);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- Jobs are accessed server-side with the service role key, so RLS is a
-- safety net: users should never reach this table directly from the browser.
DROP POLICY IF EXISTS "Users can read their own jobs" ON generation_jobs;
CREATE POLICY "Users can read their own jobs"
  ON generation_jobs FOR SELECT USING (auth.uid() = user_id);

-- v5 ? v6 upgrade note
-- =============================================================

-- =============================================================
-- v6 -> v7: AI credits and quota enforcement
-- =============================================================

CREATE TABLE IF NOT EXISTS ai_user_quotas (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start       DATE NOT NULL DEFAULT CURRENT_DATE,
  credits_used       INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  credits_limit      INTEGER NOT NULL DEFAULT 30 CHECK (credits_limit > 0),
  burst_window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  burst_used         INTEGER NOT NULL DEFAULT 0 CHECK (burst_used >= 0),
  burst_limit        INTEGER NOT NULL DEFAULT 3 CHECK (burst_limit > 0),
  last_request_at    TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_user_quotas_updated_at ON ai_user_quotas(updated_at DESC);

CREATE TRIGGER update_ai_user_quotas_updated_at
  BEFORE UPDATE ON ai_user_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ai_user_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own ai quotas" ON ai_user_quotas;
CREATE POLICY "Users can read their own ai quotas"
  ON ai_user_quotas FOR SELECT USING (auth.uid() = user_id);

DROP FUNCTION IF EXISTS consume_ai_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION consume_ai_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_daily_limit INTEGER,
  p_burst_window_seconds INTEGER,
  p_burst_limit INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  daily_limit INTEGER,
  credits_used INTEGER,
  credits_remaining INTEGER,
  period_start DATE,
  period_end TIMESTAMP WITH TIME ZONE,
  burst_limit INTEGER,
  burst_used INTEGER,
  burst_window_reset_at TIMESTAMP WITH TIME ZONE,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_row ai_user_quotas%ROWTYPE;
  v_window_end TIMESTAMP WITH TIME ZONE;
  v_retry_seconds INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'p_credits must be > 0';
  END IF;

  IF p_daily_limit IS NULL OR p_daily_limit <= 0 THEN
    RAISE EXCEPTION 'p_daily_limit must be > 0';
  END IF;

  IF p_burst_window_seconds IS NULL OR p_burst_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_burst_window_seconds must be > 0';
  END IF;

  IF p_burst_limit IS NULL OR p_burst_limit <= 0 THEN
    RAISE EXCEPTION 'p_burst_limit must be > 0';
  END IF;

  INSERT INTO ai_user_quotas (
    user_id,
    period_start,
    credits_used,
    credits_limit,
    burst_window_start,
    burst_used,
    burst_limit,
    last_request_at
  )
  VALUES (
    p_user_id,
    CURRENT_DATE,
    0,
    p_daily_limit,
    v_now,
    0,
    p_burst_limit,
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row
  FROM ai_user_quotas
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_row.period_start <> CURRENT_DATE THEN
    v_row.period_start := CURRENT_DATE;
    v_row.credits_used := 0;
  END IF;

  v_row.credits_limit := p_daily_limit;
  v_row.burst_limit := p_burst_limit;

  IF v_row.burst_window_start IS NULL
     OR v_row.burst_window_start + make_interval(secs => p_burst_window_seconds) <= v_now THEN
    v_row.burst_window_start := v_now;
    v_row.burst_used := 0;
  END IF;

  v_window_end := v_row.burst_window_start + make_interval(secs => p_burst_window_seconds);

  IF v_row.credits_used + p_credits > v_row.credits_limit THEN
    RETURN QUERY
    SELECT
      FALSE,
      'daily_limit',
      v_row.credits_limit,
      v_row.credits_used,
      GREATEST(v_row.credits_limit - v_row.credits_used, 0),
      v_row.period_start,
      (v_row.period_start + INTERVAL '1 day')::timestamptz,
      v_row.burst_limit,
      v_row.burst_used,
      v_window_end,
      0;
    RETURN;
  END IF;

  IF v_row.burst_used + 1 > v_row.burst_limit THEN
    v_retry_seconds := GREATEST(CEIL(EXTRACT(EPOCH FROM (v_window_end - v_now)))::INTEGER, 1);

    RETURN QUERY
    SELECT
      FALSE,
      'burst_limit',
      v_row.credits_limit,
      v_row.credits_used,
      GREATEST(v_row.credits_limit - v_row.credits_used, 0),
      v_row.period_start,
      (v_row.period_start + INTERVAL '1 day')::timestamptz,
      v_row.burst_limit,
      v_row.burst_used,
      v_window_end,
      v_retry_seconds;
    RETURN;
  END IF;

  UPDATE ai_user_quotas
  SET
    period_start = v_row.period_start,
    credits_used = v_row.credits_used + p_credits,
    credits_limit = v_row.credits_limit,
    burst_window_start = v_row.burst_window_start,
    burst_used = v_row.burst_used + 1,
    burst_limit = v_row.burst_limit,
    last_request_at = v_now,
    updated_at = v_now
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT
    TRUE,
    'ok',
    v_row.credits_limit,
    v_row.credits_used + p_credits,
    GREATEST(v_row.credits_limit - (v_row.credits_used + p_credits), 0),
    v_row.period_start,
    (v_row.period_start + INTERVAL '1 day')::timestamptz,
    v_row.burst_limit,
    v_row.burst_used + 1,
    v_window_end,
    0;
END;
$$;
