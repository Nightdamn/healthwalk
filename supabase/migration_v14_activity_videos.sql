-- ═══════════════════════════════════════════════════════════
-- V14: Activity videos — video attachments for course activities
-- ═══════════════════════════════════════════════════════════

CREATE TABLE activity_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  video_type TEXT NOT NULL CHECK (video_type IN ('file', 'youtube')),
  video_url TEXT NOT NULL,
  file_size BIGINT,
  duration_sec INT,
  first_day INT NOT NULL DEFAULT 1,
  last_day INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, activity_id, first_day, last_day)
);

CREATE INDEX idx_activity_videos_course ON activity_videos(course_id);
CREATE INDEX idx_activity_videos_lookup ON activity_videos(course_id, activity_id, first_day, last_day);

-- RLS
ALTER TABLE activity_videos ENABLE ROW LEVEL SECURITY;

-- Trainers/owners can manage videos
CREATE POLICY "Course owner/trainer can manage videos"
  ON activity_videos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM courses c WHERE c.id = course_id AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = activity_videos.course_id
        AND ce.user_id = auth.uid()
        AND ce.role IN ('trainer', 'curator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c WHERE c.id = course_id AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = activity_videos.course_id
        AND ce.user_id = auth.uid()
        AND ce.role IN ('trainer', 'curator')
    )
  );

-- Students enrolled in course can read videos
CREATE POLICY "Enrolled users can view videos"
  ON activity_videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = activity_videos.course_id
        AND ce.user_id = auth.uid()
    )
  );

-- ── Storage bucket for course videos ──
-- Run in Supabase Dashboard > Storage > Create bucket:
--   Name: course-videos
--   Public: false
--   File size limit: 524288000 (500MB)
--   Allowed MIME types: video/mp4, video/webm, video/quicktime

-- Storage policies (run in SQL Editor):
-- INSERT (upload) — owner or trainer
-- CREATE POLICY "Trainers can upload videos"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'course-videos'
--     AND (
--       EXISTS (SELECT 1 FROM courses c WHERE c.id::text = (storage.foldername(name))[1] AND c.owner_id = auth.uid())
--       OR EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.course_id::text = (storage.foldername(name))[1] AND ce.user_id = auth.uid() AND ce.role IN ('trainer', 'curator'))
--     )
--   );

-- SELECT (download) — enrolled users
-- CREATE POLICY "Enrolled users can download videos"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'course-videos'
--     AND EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.course_id::text = (storage.foldername(name))[1] AND ce.user_id = auth.uid())
--   );

-- DELETE — owner or trainer
-- CREATE POLICY "Trainers can delete videos"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'course-videos'
--     AND (
--       EXISTS (SELECT 1 FROM courses c WHERE c.id::text = (storage.foldername(name))[1] AND c.owner_id = auth.uid())
--       OR EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.course_id::text = (storage.foldername(name))[1] AND ce.user_id = auth.uid() AND ce.role IN ('trainer', 'curator'))
--     )
--   );

NOTIFY pgrst, 'reload schema';
