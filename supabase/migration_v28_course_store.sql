-- v28: Витрина курсов + админ-модерация.
--
-- Идея: тренер отправляет курс «в магазин», админ модерирует
-- (approve/reject), одобренные курсы попадают в публичную витрину.
-- Админ может блокировать проблемного тренера или конкретный курс.
--
-- Оплата эквайрингом отложена; сейчас закладываем поля price + currency,
-- чтобы тренер сразу указывал цену при отправке в магазин.
--
-- Все действия админа логируются в admin_audit_log — для истории и
-- потенциального разбора спорных случаев.
--
-- ⚠️ Бэкап: /root/backups/pre-v28-course-store-2026-08-27.sql
BEGIN;

-- ─── courses: статус магазина + цена + блокировка ───────────────────
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS store_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (store_status IN ('draft', 'pending', 'approved', 'rejected', 'blocked')),
  ADD COLUMN IF NOT EXISTS store_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (price_amount >= 0),
  ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_courses_store_status
  ON courses(store_status)
  WHERE store_status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_courses_blocked
  ON courses(blocked_at)
  WHERE blocked_at IS NOT NULL;

-- ─── users: блокировка тренера (глобально скрывает все его курсы) ─
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_blocked
  ON users(blocked_at)
  WHERE blocked_at IS NOT NULL;

-- ─── admin_audit_log: журнал действий админов ─────────────────────
-- Хранит кто/что/когда сделал: approve/reject/block/unblock и метаданные
-- (причина отказа, предыдущий статус). target_type + target_id — на что
-- было действие; metadata — свободный JSONB для деталей.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'approve_course', 'reject_course',
    'block_course', 'unblock_course',
    'block_trainer', 'unblock_trainer'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN ('course', 'user')),
  target_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);

-- GRANT для приложения (миграция идёт под postgres, приложение — под instep).
GRANT ALL PRIVILEGES ON TABLE admin_audit_log TO instep;

COMMIT;
