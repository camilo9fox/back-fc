-- =============================================================
--  StudyAI  ·  Full Schema  (v2)
--  Changes from v1:
--    · flashcards.options column removed (classic Q/A format)
--    · flashcards.category_id is now NOT NULL
--    · NEW: quizzes + quiz_questions tables
--    · NEW: true_false_sets + true_false_questions tables
-- =============================================================

-- ────────────────────────────────────────────
-- RESET: Drop everything in reverse dependency order
-- ────────────────────────────────────────────

-- Questions / child tables first (depend on parent tables)
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
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id    ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON categories(created_at DESC);

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own categories"   ON categories FOR SELECT USING (auth.uid() = user_id);
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
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id      ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_category_id  ON flashcards(category_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_source       ON flashcards(source);
CREATE INDEX IF NOT EXISTS idx_flashcards_created_at   ON flashcards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_created ON flashcards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_category ON flashcards(user_id, category_id);

CREATE TRIGGER update_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own flashcards"   ON flashcards FOR SELECT USING (auth.uid() = user_id);
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
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id     ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_category_id ON quizzes(category_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at  ON quizzes(created_at DESC);

CREATE TRIGGER update_quizzes_updated_at
    BEFORE UPDATE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own quizzes"   ON quizzes FOR SELECT USING (auth.uid() = user_id);
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
CREATE POLICY "Users can read their quiz questions" ON quiz_questions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_id AND q.user_id = auth.uid())
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
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tf_sets_user_id     ON true_false_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_tf_sets_category_id ON true_false_sets(category_id);
CREATE INDEX IF NOT EXISTS idx_tf_sets_created_at  ON true_false_sets(created_at DESC);

CREATE TRIGGER update_true_false_sets_updated_at
    BEFORE UPDATE ON true_false_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE true_false_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own tf sets"   ON true_false_sets FOR SELECT USING (auth.uid() = user_id);
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

CREATE POLICY "Users can read their tf questions" ON true_false_questions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM true_false_sets s WHERE s.id = set_id AND s.user_id = auth.uid())
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
-- MIGRATION SCRIPT  (run this if upgrading from v1)
-- =============================================================
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
-- =============================================================