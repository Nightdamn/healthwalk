-- v19: align live DB with schema.sql, close findings from 0.0.00 review
-- (D-3 / D-4 / D-5 / exclusion-NOT-NULL drift). Findings D-1 and D-2
-- in the review turned out to already be aligned on the live DB; only
-- the live state matters and we're aligning everything else now.

-- D-3: messages.is_read declared NOT NULL in schema.sql, but live had it
-- nullable. `WHERE NOT is_read` silently skipped NULLs.
ALTER TABLE messages
  ALTER COLUMN is_read SET DEFAULT FALSE,
  ALTER COLUMN is_read SET NOT NULL;

-- D-4: sender_id / recipient_id FKs were RESTRICT by default. Deleting a
-- user with any sent or received message would block. Schema.sql implies
-- CASCADE; v13 (messages migration) used CASCADE. Re-create FKs with
-- CASCADE so user deletion just wipes their conversations.
ALTER TABLE messages DROP CONSTRAINT messages_sender_id_fkey;
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT messages_recipient_id_fkey;
ALTER TABLE messages
  ADD CONSTRAINT messages_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

-- Drift: student_activity_exclusions.activity_id should be NOT NULL.
ALTER TABLE student_activity_exclusions
  ALTER COLUMN activity_id SET NOT NULL;

-- D-5: activity_progress is a legacy/dead table — never read or written
-- by any current route. Drop it.
DROP TABLE IF EXISTS activity_progress;

-- High-priority indexes from the database review (cheap to add, real wins):
--   I-1 single-column index on activity_videos.activity_id for cascade delete
--   I-2 course_progress(course_id) for trainer "all students" queries
--   I-3 messages "reverse direction" lookup
--   I-4 pending_invitations(email) for "my invitations" view
CREATE INDEX IF NOT EXISTS idx_activity_videos_activity
  ON activity_videos(activity_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course
  ON course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_messages_reverse_conversation
  ON messages(course_id, recipient_id, sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email
  ON pending_invitations(email);
