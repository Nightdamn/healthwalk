-- v15: trainer-marked attendance for activity calls
ALTER TABLE call_attendance
  ADD COLUMN IF NOT EXISTS attended boolean NOT NULL DEFAULT false;
