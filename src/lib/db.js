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

// ═══════════════════════════════════════════════════════════
// USER ROLES
// ═══════════════════════════════════════════════════════════

const ROLE_HIERARCHY = { student: 0, curator: 1, trainer: 2, admin: 3 };

/**
 * Get user role. Returns 'student' by default.
 */
export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (data) return data.role;
  if (error?.code === 'PGRST116') return 'student'; // no row = student
  console.error('[DB] Failed to load role:', error);
  return 'student';
}

/**
 * Assign a role to a user by email. Only admins can do this.
 * Stores in pending_roles — applied when user logs in.
 * Returns { success, error? }
 */
export async function assignRole(adminId, targetEmail, newRole) {
  const email = targetEmail.toLowerCase().trim();

  // Upsert into pending_roles — user picks up role on next login
  const { error } = await supabase
    .from('pending_roles')
    .upsert(
      { email, role: newRole, assigned_by: adminId },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('[DB] Failed to assign role:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Check for pending role on login and apply it.
 */
export async function checkAndApplyPendingRole(userId, email) {
  // Check pending_roles
  const { data } = await supabase
    .from('pending_roles')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (data) {
    // Apply the role
    await supabase.from('user_roles').upsert(
      { user_id: userId, role: data.role, assigned_by: data.assigned_by },
      { onConflict: 'user_id' }
    );
    // Delete pending
    await supabase.from('pending_roles').delete().eq('email', email.toLowerCase().trim());
    return data.role;
  }

  // No pending, get current role
  return await getUserRole(userId);
}

// ═══════════════════════════════════════════════════════════
// COURSES
// ═══════════════════════════════════════════════════════════

export async function createCourse(ownerId, title, description, daysCount) {
  const { data, error } = await supabase
    .from('courses')
    .insert({ owner_id: ownerId, title, description, days_count: daysCount })
    .select()
    .single();

  if (error) { console.error('[DB] Create course failed:', error); return null; }
  return data;
}

export async function getOwnCourses(ownerId) {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) { console.error('[DB] Load courses failed:', error); return []; }
  return data || [];
}

export async function getEnrolledCourses(userId) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, courses(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (error) { console.error('[DB] Load enrolled courses failed:', error); return []; }
  return data || [];
}

export async function getCourseStudents(courseId) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_id', courseId);

  if (error) { console.error('[DB] Load students failed:', error); return []; }
  return data || [];
}

export async function inviteToCourse(courseId, email, role, invitedBy) {
  // Store as pending invitation (user may not exist yet)
  const { error } = await supabase
    .from('pending_invitations')
    .upsert(
      { course_id: courseId, email: email.toLowerCase().trim(), role, invited_by: invitedBy },
      { onConflict: 'course_id,email' }
    );

  if (error) { console.error('[DB] Invite failed:', error); return { success: false, error: error.message }; }
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

export async function sendMessage(courseId, senderId, recipientId, body) {
  const { error } = await supabase
    .from('messages')
    .insert({ course_id: courseId, sender_id: senderId, recipient_id: recipientId, body });

  if (error) { console.error('[DB] Send message failed:', error); return false; }
  return true;
}

export async function getMessages(userId, courseId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('course_id', courseId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: true });

  if (error) { console.error('[DB] Load messages failed:', error); return []; }
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// PERSONAL TRACKERS
// ═══════════════════════════════════════════════════════════

export async function createTracker(userId, { title, avatarIcon, avatarCustom, daysCount, practices }) {
  // 1. Create the tracker
  const { data: tracker, error: tErr } = await supabase
    .from('personal_trackers')
    .insert({
      user_id: userId,
      title,
      avatar_icon: avatarIcon || null,
      avatar_custom: avatarCustom || null,
      days_count: daysCount,
    })
    .select()
    .single();

  if (tErr) { console.error('[DB] Create tracker failed:', tErr); return null; }

  // 2. Create practices
  if (practices && practices.length > 0) {
    const rows = practices.map((p, i) => ({
      tracker_id: tracker.id,
      title: p.title,
      icon_num: p.iconNum || 1,
      first_day: p.firstDay || 1,
      last_day: p.lastDay || daysCount,
      duration_min: p.durationMin || 10,
      sort_order: i,
    }));

    const { error: pErr } = await supabase
      .from('tracker_practices')
      .insert(rows);

    if (pErr) console.error('[DB] Create practices failed:', pErr);
  }

  return tracker;
}

export async function getMyTrackers(userId) {
  const { data, error } = await supabase
    .from('personal_trackers')
    .select('*, tracker_practices(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { console.error('[DB] Load trackers failed:', error); return []; }
  return data || [];
}

export async function deleteTracker(trackerId) {
  const { error } = await supabase
    .from('personal_trackers')
    .delete()
    .eq('id', trackerId);

  if (error) { console.error('[DB] Delete tracker failed:', error); return false; }
  return true;
}
