-- Create flashcards table with user association
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  options JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_source ON flashcards(source);
CREATE INDEX IF NOT EXISTS idx_flashcards_created_at ON flashcards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_created ON flashcards(user_id, created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own flashcards
CREATE POLICY "Users can read their own flashcards" ON flashcards
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy for users to insert their own flashcards
CREATE POLICY "Users can insert their own flashcards" ON flashcards
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own flashcards
CREATE POLICY "Users can update their own flashcards" ON flashcards
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcards" ON flashcards
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================================
-- AI credits and quota enforcement
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