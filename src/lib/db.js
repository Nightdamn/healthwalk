import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════
// USER SETTINGS
// ═══════════════════════════════════════════════════════════

/**
 * Загрузить настройки пользователя.
 * Если записи нет — создаёт дефолтную.
 */
export async function loadUserSettings(userId) {
  // Try to get existing
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data) return data;

  // Not found — create default
  if (error?.code === 'PGRST116') {
    const defaultTz = -(new Date().getTimezoneOffset());
    const now = new Date();
    // Course start: today at 5:00 (or yesterday 5:00 if before 5am)
    const d = new Date(now);
    if (now.getHours() < 5) d.setDate(d.getDate() - 1);
    d.setHours(5, 0, 0, 0);

    const newSettings = {
      user_id: userId,
      course_start_date: d.toISOString(),
      tz_offset_min: defaultTz,
      current_day: 1,
      day_start_hour: 5,
    };

    const { data: created, error: insertErr } = await supabase
      .from('user_settings')
      .insert(newSettings)
      .select()
      .single();

    if (insertErr) {
      console.error('[DB] Failed to create settings:', insertErr);
      return newSettings; // return defaults even if insert fails
    }
    return created;
  }

  console.error('[DB] Failed to load settings:', error);
  return null;
}

/**
 * Обновить настройки (current_day, tz_offset_min)
 */
export async function saveUserSettings(userId, updates) {
  const { error } = await supabase
    .from('user_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) console.error('[DB] Failed to save settings:', error);
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY PROGRESS
// ═══════════════════════════════════════════════════════════

/**
 * Загрузить весь прогресс пользователя (все дни, все активности).
 * Возвращает объект: { 1: { warmup: { elapsed: 300, completed: true }, ... }, ... }
 */
export async function loadAllProgress(userId) {
  const { data, error } = await supabase
    .from('activity_progress')
    .select('day, activity_id, elapsed_seconds, completed')
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Failed to load progress:', error);
    return {};
  }

  // Convert flat rows to nested object
  const result = {};
  for (const row of (data || [])) {
    if (!result[row.day]) result[row.day] = {};
    result[row.day][row.activity_id] = {
      elapsed: row.elapsed_seconds,
      completed: row.completed,
    };
  }
  return result;
}

/**
 * Сохранить прогресс одной активности (upsert).
 */
export async function saveActivityProgress(userId, day, activityId, elapsedSeconds, completed) {
  const { error } = await supabase
    .from('activity_progress')
    .upsert(
      {
        user_id: userId,
        day,
        activity_id: activityId,
        elapsed_seconds: elapsedSeconds,
        completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day,activity_id' }
    );

  if (error) console.error('[DB] Failed to save activity progress:', error);
}

// ═══════════════════════════════════════════════════════════
// QUESTIONS
// ═══════════════════════════════════════════════════════════

export async function submitQuestion(userId, questionText) {
  const { error } = await supabase
    .from('questions')
    .insert({ user_id: userId, question: questionText });

  if (error) {
    console.error('[DB] Failed to submit question:', error);
    return false;
  }
  return true;
}
