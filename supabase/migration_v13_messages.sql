-- ═══════════════════════════════════════════════════════════
-- V13: Messages system for student-trainer communication
-- ═══════════════════════════════════════════════════════════

-- Drop old messages table if exists (from earlier prototype)
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS questions;

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL CHECK (char_length(body) <= 500),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_course ON messages(course_id);
CREATE INDEX idx_messages_recipient_unread ON messages(recipient_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_messages_conversation ON messages(course_id, sender_id, recipient_id);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own messages"
  ON messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can mark as read"
  ON messages FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ── Send message ──
CREATE OR REPLACE FUNCTION send_message(
  p_course_id UUID, p_recipient_id UUID, p_body TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Verify both sender and recipient are enrolled in the course
  IF NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sender not enrolled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = p_recipient_id) THEN
    RAISE EXCEPTION 'Recipient not enrolled';
  END IF;

  INSERT INTO messages (course_id, sender_id, recipient_id, body)
  VALUES (p_course_id, auth.uid(), p_recipient_id, p_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Get conversation between two users in a course ──
CREATE OR REPLACE FUNCTION get_conversation(
  p_course_id UUID, p_other_user_id UUID
) RETURNS TABLE (
  id UUID, sender_id UUID, recipient_id UUID, body TEXT, is_read BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.sender_id, m.recipient_id, m.body, m.is_read, m.created_at
  FROM messages m
  WHERE m.course_id = p_course_id
    AND (
      (m.sender_id = auth.uid() AND m.recipient_id = p_other_user_id)
      OR (m.sender_id = p_other_user_id AND m.recipient_id = auth.uid())
    )
  ORDER BY m.created_at ASC;
END;
$$;

-- ── Mark messages as read ──
CREATE OR REPLACE FUNCTION mark_messages_read(
  p_course_id UUID, p_sender_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE messages SET is_read = true
  WHERE course_id = p_course_id
    AND sender_id = p_sender_id
    AND recipient_id = auth.uid()
    AND NOT is_read;
END;
$$;

-- ── Get unread count for current user ──
CREATE OR REPLACE FUNCTION get_unread_count()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM messages
  WHERE recipient_id = auth.uid() AND NOT is_read;
  RETURN v_count;
END;
$$;

-- ── Get course staff (trainers + curators + owner) for student to pick recipient ──
DROP FUNCTION IF EXISTS get_course_staff(UUID);
CREATE OR REPLACE FUNCTION get_course_staff(p_course_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  role TEXT,
  is_owner BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Verify caller is enrolled
  IF NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not enrolled';
  END IF;

  SELECT owner_id INTO v_owner_id FROM courses WHERE id = p_course_id;

  RETURN QUERY
  -- Enrolled trainers/curators
  SELECT
    ce.user_id,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      u.raw_user_meta_data->>'preferred_username',
      split_part(u.email, '@', 1)
    )::TEXT AS display_name,
    ce.role,
    (ce.user_id = v_owner_id) AS is_owner
  FROM course_enrollments ce
  JOIN auth.users u ON u.id = ce.user_id
  WHERE ce.course_id = p_course_id
    AND (ce.role IN ('trainer', 'curator') OR ce.user_id = v_owner_id)
    AND ce.user_id != auth.uid()
  UNION
  -- Owner even if not enrolled
  SELECT
    v_owner_id,
    COALESCE(
      u2.raw_user_meta_data->>'full_name',
      u2.raw_user_meta_data->>'name',
      u2.raw_user_meta_data->>'preferred_username',
      split_part(u2.email, '@', 1)
    )::TEXT AS display_name,
    'trainer'::TEXT,
    true AS is_owner
  FROM auth.users u2
  WHERE u2.id = v_owner_id
    AND v_owner_id != auth.uid()
    AND NOT EXISTS (SELECT 1 FROM course_enrollments WHERE course_id = p_course_id AND user_id = v_owner_id)
  ORDER BY is_owner DESC, display_name ASC;
END;
$$;

-- ── Get unread counts grouped by conversation (course + sender) ──
CREATE OR REPLACE FUNCTION get_unread_by_conversation()
RETURNS TABLE (
  course_id UUID, sender_id UUID, unread_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT m.course_id, m.sender_id, COUNT(*) AS unread_count
  FROM messages m
  WHERE m.recipient_id = auth.uid() AND NOT m.is_read
  GROUP BY m.course_id, m.sender_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
