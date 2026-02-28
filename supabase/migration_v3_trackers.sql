-- ═══════════════════════════════════════════════════════════
-- V3: Personal Trackers
-- Run AFTER migration_v2_roles.sql
-- ═══════════════════════════════════════════════════════════

-- 1. Personal trackers (owned by user, not shareable)
CREATE TABLE IF NOT EXISTS personal_trackers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  avatar_icon INTEGER,            -- icon number from catalog (1-101)
  avatar_custom TEXT,              -- custom uploaded SVG data URL
  days_count INTEGER NOT NULL DEFAULT 30 CHECK (days_count BETWEEN 1 AND 365),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Practices within a tracker
CREATE TABLE IF NOT EXISTS tracker_practices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID REFERENCES personal_trackers ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  icon_num INTEGER NOT NULL DEFAULT 1,   -- icon number from catalog
  first_day INTEGER NOT NULL DEFAULT 1,
  last_day INTEGER NOT NULL DEFAULT 30,
  duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min > 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 3. Progress tracking for personal tracker practices
CREATE TABLE IF NOT EXISTS tracker_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tracker_id UUID REFERENCES personal_trackers ON DELETE CASCADE NOT NULL,
  practice_id UUID REFERENCES tracker_practices ON DELETE CASCADE NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tracker_id, practice_id, day)
);

-- ═══════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════

ALTER TABLE personal_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_progress ENABLE ROW LEVEL SECURITY;

-- personal_trackers: user can manage own
CREATE POLICY "Users manage own trackers" ON personal_trackers FOR ALL
  USING (user_id = auth.uid());

-- tracker_practices: accessible if user owns the parent tracker
CREATE POLICY "Users manage own tracker practices" ON tracker_practices FOR ALL
  USING (EXISTS (SELECT 1 FROM personal_trackers WHERE id = tracker_id AND user_id = auth.uid()));

-- tracker_progress: user can manage own
CREATE POLICY "Users manage own tracker progress" ON tracker_progress FOR ALL
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_personal_trackers_user ON personal_trackers (user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_practices_tracker ON tracker_practices (tracker_id);
CREATE INDEX IF NOT EXISTS idx_tracker_progress_user ON tracker_progress (user_id, tracker_id);
