-- v16: extend student_custom_activities with practice type + description so trainer-added
-- per-student practices can be theory/call (not only timer-based media practices).
ALTER TABLE student_custom_activities
  ADD COLUMN IF NOT EXISTS practice_type TEXT NOT NULL DEFAULT 'media'
    CHECK (practice_type IN ('media', 'theory', 'call')),
  ADD COLUMN IF NOT EXISTS description_html TEXT;
