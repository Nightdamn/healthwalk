-- v34 (2026-10-13): имя и аватар, заданные пользователем в профиле.
-- Вход через Google при каждом входе обновлял display_name и avatar_url из
-- Google-аккаунта — своё имя/фото откатывались бы. Пока флаг стоит, Google их
-- не трогает. Убрал своё фото — флаг снимается, снова подтянется из Google.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name_set_by_user BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_set_by_user BOOLEAN NOT NULL DEFAULT false;
