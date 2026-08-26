-- v26: email/password логин + верификация + восстановление пароля.
-- ⚠️ Бэкап: /root/backups/pre-v26-email-auth-2026-08-26.sql
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_code TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ,
  -- Согласие на обработку ПД (152-ФЗ): timestamp когда чекбокс подписан.
  ADD COLUMN IF NOT EXISTS consent_pd_at TIMESTAMPTZ;

-- Google-users уже верифицированы (email пришёл от OAuth).
UPDATE users SET email_verified = TRUE WHERE provider = 'google' AND email_verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_reset_code ON users(password_reset_code) WHERE password_reset_code IS NOT NULL;

COMMIT;
