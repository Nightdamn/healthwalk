import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════
// USER SETTINGS
// ═══════════════════════════════════════════════════════════

export async function loadUserSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings').select('*').eq('user_id', userId).single();

  if (data) return data;

  if (error?.code === 'PGRST116') {
    const defaultTz = -(new Date().getTimezoneOffset());
    const now = new Date();
    const d = new Date(now);
    if (now.getHours() < 5) d.setDate(d.getDate() - 1);
    d.setHours(5, 0, 0, 0);

    const newSettings = {
      user_id: userId, course_start_date: d.toISOString(),
      tz_offset_min: defaultTz, current_day: 1, day_start_hour: 5,
      active_type: null, active_id: null,
    };

    const { data: created, error: iErr } = await supabase
      .from('user_settings').insert(newSettings).select().single();
    if (iErr) { console.error('[DB] Create settings:', iErr); return newSettings; }
    return created;
  }
  console.error('[DB] Load settings:', error);
  return null;
}

export async function saveUserSettings(userId, updates) {
  const { error } = await supabase
    .from('user_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) console.error('[DB] Save settings:', error);
}

export async function saveActiveContext(userId, type, id) {
  await saveUserSettings(userId, { active_type: type, active_id: id });
}

// ═══════════════════════════════════════════════════════════
// AVAILABLE ITEMS — courses + trackers for switcher
// ═══════════════════════════════════════════════════════════

function mapActivities(acts, fallbackDays) {
  return (acts || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(a => ({
      id: a.id,
      activityId: a.activity_id || a.id,
      label: a.label || a.title,
      durationMin: a.duration_min,
      iconNum: a.icon_num || 'health/1',
      firstDay: a.first_day || 1,
      lastDay: a.last_day || fallbackDays,
      intervalDays: a.interval_days || 1,
    }));
}

export async function getAvailableItems(userId) {
  // 1. Enrolled courses
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('role, joined_at, courses(id, title, days_count, avatar_icon, avatar_custom, owner_id, created_at, course_activities(*))')
    .eq('user_id', userId);

  const courseIds = new Set();
  const courses = (enrollments || []).filter(e => e.courses).map(e => {
    courseIds.add(e.courses.id);
    // Use enrollment joined_at as start date; fallback to course created_at
    const startDate = (e.joined_at || e.courses.created_at || '').slice(0, 10) || null;
    return {
      type: 'course', id: e.courses.id, title: e.courses.title,
      daysCount: e.courses.days_count, avatarIcon: e.courses.avatar_icon,
      avatarCustom: e.courses.avatar_custom, ownerId: e.courses.owner_id,
      enrollRole: e.role, startDate,
      activities: mapActivities(e.courses.course_activities, e.courses.days_count),
    };
  });

  // 2. Own courses not yet in list
  const { data: ownCourses } = await supabase
    .from('courses')
    .select('id, title, days_count, avatar_icon, avatar_custom, owner_id, created_at, course_activities(*)')
    .eq('owner_id', userId);

  for (const c of (ownCourses || [])) {
    if (!courseIds.has(c.id)) {
      const startDate = (c.created_at || '').slice(0, 10) || null;
      courses.push({
        type: 'course', id: c.id, title: c.title,
        daysCount: c.days_count, avatarIcon: c.avatar_icon,
        avatarCustom: c.avatar_custom, ownerId: c.owner_id, enrollRole: 'trainer',
        startDate,
        activities: mapActivities(c.course_activities, c.days_count),
      });
    }
  }

  // 3. Personal trackers
  const { data: trackers } = await supabase
    .from('personal_trackers')
    .select('*, tracker_practices(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const trackerItems = (trackers || []).map(t => ({
    type: 'tracker', id: t.id, title: t.title,
    daysCount: t.days_count, avatarIcon: t.avatar_icon,
    avatarCustom: t.avatar_custom, ownerId: userId,
    startDate: t.start_date || null,
    activities: (t.tracker_practices || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(p => ({
        id: p.id, activityId: p.id, label: p.title,
        durationMin: p.duration_min, iconNum: p.icon_num || 'health/1',
        firstDay: p.first_day || 1, lastDay: p.last_day || t.days_count,
        intervalDays: p.interval_days || 1,
      })),
  }));

  return [...trackerItems, ...courses];
}

// ═══════════════════════════════════════════════════════════
// COURSE PROGRESS
// ═══════════════════════════════════════════════════════════

export async function loadCourseProgress(userId, courseId) {
  const { data, error } = await supabase
    .from('course_progress')
    .select('activity_id, day, elapsed_seconds, completed')
    .eq('user_id', userId).eq('course_id', courseId);
  if (error) { console.error('[DB] Load course progress:', error); return {}; }
  const r = {};
  for (const row of (data || [])) {
    if (!r[row.day]) r[row.day] = {};
    r[row.day][row.activity_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
  }
  return r;
}

export async function saveCourseActivityProgress(userId, courseId, activityId, day, elapsed, completed) {
  const { error } = await supabase.from('course_progress').upsert(
    { user_id: userId, course_id: courseId, activity_id: activityId, day, elapsed_seconds: elapsed, completed, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,course_id,activity_id,day' }
  );
  if (error) console.error('[DB] Save course progress:', error);
}

// ═══════════════════════════════════════════════════════════
// TRACKER PROGRESS
// ═══════════════════════════════════════════════════════════

export async function loadTrackerProgress(userId, trackerId) {
  const { data, error } = await supabase
    .from('tracker_progress')
    .select('practice_id, day, elapsed_seconds, completed')
    .eq('user_id', userId).eq('tracker_id', trackerId);
  if (error) { console.error('[DB] Load tracker progress:', error); return {}; }
  const r = {};
  for (const row of (data || [])) {
    if (!r[row.day]) r[row.day] = {};
    r[row.day][row.practice_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
  }
  return r;
}

export async function saveTrackerActivityProgress(userId, trackerId, practiceId, day, elapsed, completed) {
  const { error } = await supabase.from('tracker_progress').upsert(
    { user_id: userId, tracker_id: trackerId, practice_id: practiceId, day, elapsed_seconds: elapsed, completed, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,tracker_id,practice_id,day' }
  );
  if (error) console.error('[DB] Save tracker progress:', error);
}

// ═══════════════════════════════════════════════════════════
// LEGACY PROGRESS (old activity_progress table)
// ═══════════════════════════════════════════════════════════

export async function loadAllProgress(userId) {
  const { data, error } = await supabase
    .from('activity_progress')
    .select('day, activity_id, elapsed_seconds, completed')
    .eq('user_id', userId);
  if (error) { console.error('[DB] Load progress:', error); return {}; }
  const r = {};
  for (const row of (data || [])) {
    if (!r[row.day]) r[row.day] = {};
    r[row.day][row.activity_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
  }
  return r;
}

export async function saveActivityProgress(userId, day, activityId, elapsed, completed) {
  const { error } = await supabase.from('activity_progress').upsert(
    { user_id: userId, day, activity_id: activityId, elapsed_seconds: elapsed, completed, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,day,activity_id' }
  );
  if (error) console.error('[DB] Save progress:', error);
}

// ═══════════════════════════════════════════════════════════
// QUESTIONS
// ═══════════════════════════════════════════════════════════

export async function submitQuestion(userId, questionText) {
  const { error } = await supabase.from('questions').insert({ user_id: userId, question: questionText });
  if (error) { console.error('[DB] Submit question:', error); return false; }
  return true;
}

// ═══════════════════════════════════════════════════════════
// USER ROLES
// ═══════════════════════════════════════════════════════════

export async function getUserRole(userId) {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
  if (data) return data.role;
  if (error?.code === 'PGRST116') return 'student';
  return 'student';
}

export async function assignRole(adminId, targetEmail, newRole) {
  const email = targetEmail.toLowerCase().trim();
  const { error } = await supabase.from('pending_roles').upsert({ email, role: newRole, assigned_by: adminId }, { onConflict: 'email' });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function checkAndApplyPendingRole(userId, email) {
  const { data } = await supabase.from('pending_roles').select('*').eq('email', email.toLowerCase().trim()).single();
  if (data) {
    await supabase.from('user_roles').upsert({ user_id: userId, role: data.role, assigned_by: data.assigned_by }, { onConflict: 'user_id' });
    await supabase.from('pending_roles').delete().eq('email', email.toLowerCase().trim());
    return data.role;
  }
  return await getUserRole(userId);
}

// ═══════════════════════════════════════════════════════════
// COURSES — CONSTRUCTOR
// ═══════════════════════════════════════════════════════════

export async function createCourseWithActivities(ownerId, { title, description, avatarIcon, avatarCustom, daysCount, activities }) {
  // 1. Create course
  const { data: course, error: cErr } = await supabase
    .from('courses')
    .insert({ owner_id: ownerId, title, description: description || '', days_count: daysCount, avatar_icon: avatarIcon || null, avatar_custom: avatarCustom || null })
    .select().single();

  if (cErr) {
    console.error('[DB] Create course:', cErr);
    return { error: cErr.message || 'Ошибка создания курса' };
  }

  // 2. Create activities
  if (activities?.length) {
    const rows = activities.map((a, i) => ({
      course_id: course.id, activity_id: a.activityId || `act_${Date.now()}_${i}`,
      label: a.label, duration_min: a.durationMin || 10, icon_num: a.iconNum || 'health/1',
      first_day: a.firstDay || 1, last_day: a.lastDay || daysCount, sort_order: i,
      interval_days: a.intervalDays || 1,
    }));
    const { error: aErr } = await supabase.from('course_activities').insert(rows);
    if (aErr) console.error('[DB] Create activities:', aErr);
  }

  // 3. Auto-enroll owner as trainer
  const { error: eErr } = await supabase.from('course_enrollments')
    .insert({ course_id: course.id, user_id: ownerId, role: 'trainer', invited_by: ownerId });
  if (eErr) console.error('[DB] Auto-enroll owner:', eErr);

  return course;
}

export async function createCourse(ownerId, title, description, daysCount) {
  return createCourseWithActivities(ownerId, { title, description, daysCount, activities: [] });
}

export async function loadCourseForEdit(courseId) {
  const { data, error } = await supabase
    .from('courses')
    .select('*, course_activities(*)')
    .eq('id', courseId)
    .single();
  if (error) { console.error('[DB] Load course for edit:', error); return null; }
  return data;
}

export async function updateCourseWithActivities(courseId, { title, description, avatarIcon, avatarCustom, daysCount, activities, deletedActivityIds }) {
  // 1. Update course metadata
  const meta = { title, description: description || '', days_count: daysCount, avatar_icon: avatarIcon || null, avatar_custom: avatarCustom || null };
  const { error: cErr } = await supabase.from('courses').update(meta).eq('id', courseId);
  if (cErr) {
    console.error('[DB] Update course:', cErr);
    // If avatar_icon type mismatch, retry without it
    if (cErr.message?.includes('avatar_icon') || cErr.code === '22P02') {
      const { avatar_icon, ...metaNoIcon } = meta;
      const { error: e2 } = await supabase.from('courses').update(metaNoIcon).eq('id', courseId);
      if (e2) return { error: e2.message };
    } else {
      return { error: cErr.message };
    }
  }

  // 2. Delete removed activities
  if (deletedActivityIds?.length) {
    const { error: dErr } = await supabase
      .from('course_activities')
      .delete()
      .in('id', deletedActivityIds);
    if (dErr) console.error('[DB] Delete activities:', dErr);
  }

  // 3. Upsert activities (update existing + insert new)
  const errors = [];
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    const row = {
      label: a.label, duration_min: a.durationMin, icon_num: a.iconNum,
      first_day: a.firstDay, last_day: a.lastDay, sort_order: i,
      interval_days: a.intervalDays || 1,
    };
    if (a.dbId) {
      const { error } = await supabase.from('course_activities').update(row).eq('id', a.dbId);
      if (error) {
        console.error('[DB] Update activity:', a.dbId, error);
        // If icon_num type mismatch (TEXT vs INTEGER), retry without icon_num
        if (error.message?.includes('icon_num') || error.code === '22P02') {
          const { icon_num, ...rowNoIcon } = row;
          const { error: e2 } = await supabase.from('course_activities').update(rowNoIcon).eq('id', a.dbId);
          if (e2) { console.error('[DB] Retry update activity:', e2); errors.push(e2.message); }
        } else {
          errors.push(error.message);
        }
      }
    } else {
      const { error } = await supabase.from('course_activities').insert({
        ...row, course_id: courseId, activity_id: `act_${Date.now()}_${i}`,
      });
      if (error) {
        console.error('[DB] Insert activity:', error);
        errors.push(error.message);
      }
    }
  }

  if (errors.length) return { id: courseId, error: errors.join('; ') };
  return { id: courseId };
}

export async function getOwnCourses(ownerId) {
  const { data, error } = await supabase
    .from('courses')
    .select('*, course_activities(id)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function getEnrolledCourses(userId) {
  const { data, error } = await supabase
    .from('course_enrollments').select('*, courses(*)').eq('user_id', userId).order('joined_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function getCourseStudents(courseId) {
  const { data, error } = await supabase.from('course_enrollments').select('*').eq('course_id', courseId);
  if (error) return [];
  return data || [];
}

export async function inviteToCourse(courseId, email, role, invitedBy) {
  const { data, error } = await supabase.rpc('invite_to_course', {
    p_course_id: courseId,
    p_email: email.toLowerCase().trim(),
    p_role: role,
    p_invited_by: invitedBy,
  });
  if (error) return { success: false, error: error.message };
  return data || { success: false, error: 'No response' };
}

export async function getMyInvitations(email) {
  const { data, error } = await supabase
    .from('pending_invitations')
    .select('*, courses(id, title, description, days_count, avatar_icon, avatar_custom)')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false });
  if (error) { console.error('[DB] Load invitations:', error); return []; }
  return data || [];
}

export async function acceptInvitation(invitationId) {
  const { data, error } = await supabase.rpc('accept_course_invitation', { p_invitation_id: invitationId });
  if (error) { console.error('[DB] Accept invitation:', error); return { success: false, error: error.message }; }
  return data || { success: false, error: 'No response' };
}

export async function declineInvitation(invitationId) {
  const { data, error } = await supabase.rpc('decline_course_invitation', { p_invitation_id: invitationId });
  if (error) { console.error('[DB] Decline invitation:', error); return { success: false, error: error.message }; }
  return data || { success: false, error: 'No response' };
}

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

export async function sendMessage(courseId, senderId, recipientId, body) {
  const { error } = await supabase.from('messages').insert({ course_id: courseId, sender_id: senderId, recipient_id: recipientId, body });
  if (error) return false;
  return true;
}

export async function getMessages(userId, courseId) {
  const { data, error } = await supabase.from('messages').select('*')
    .eq('course_id', courseId).or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// PERSONAL TRACKERS
// ═══════════════════════════════════════════════════════════

export async function createTracker(userId, { title, avatarIcon, avatarCustom, daysCount, practices }) {
  const { data: tracker, error: tErr } = await supabase
    .from('personal_trackers')
    .insert({
      user_id: userId, title,
      avatar_icon: avatarIcon || null,
      avatar_custom: avatarCustom || null,
      days_count: daysCount,
      start_date: new Date().toISOString().slice(0, 10),
    })
    .select().single();
  if (tErr) { console.error('[DB] Create tracker:', tErr); return null; }

  if (practices?.length) {
    const rows = practices.map((p, i) => ({
      tracker_id: tracker.id, title: p.title, icon_num: p.iconNum || 'health/1',
      first_day: p.firstDay || 1, last_day: p.lastDay || daysCount,
      duration_min: p.durationMin || 10, sort_order: i,
      interval_days: p.intervalDays || 1,
    }));
    await supabase.from('tracker_practices').insert(rows);
  }
  return tracker;
}

export async function getMyTrackers(userId) {
  const { data, error } = await supabase
    .from('personal_trackers').select('*, tracker_practices(*)')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function deleteTracker(trackerId) {
  const { error } = await supabase.from('personal_trackers').delete().eq('id', trackerId);
  return !error;
}

export async function loadTrackerForEdit(trackerId) {
  const { data, error } = await supabase
    .from('personal_trackers')
    .select('*, tracker_practices(*)')
    .eq('id', trackerId)
    .single();
  if (error) { console.error('[DB] Load tracker for edit:', error); return null; }
  return data;
}

export async function updateTrackerWithPractices(trackerId, { title, avatarIcon, avatarCustom, daysCount, practices, deletedPracticeIds }) {
  // 1. Update tracker metadata
  const meta = { title, avatar_icon: avatarIcon || null, avatar_custom: avatarCustom || null, days_count: daysCount };
  const { error: tErr } = await supabase.from('personal_trackers').update(meta).eq('id', trackerId);
  if (tErr) { console.error('[DB] Update tracker:', tErr); return { error: tErr.message }; }

  // 2. Delete removed practices
  if (deletedPracticeIds?.length) {
    const { error: dErr } = await supabase.from('tracker_practices').delete().in('id', deletedPracticeIds);
    if (dErr) console.error('[DB] Delete practices:', dErr);
  }

  // 3. Upsert practices
  const errors = [];
  for (let i = 0; i < practices.length; i++) {
    const p = practices[i];
    const row = {
      title: p.title, icon_num: p.iconNum || 'health/1',
      first_day: p.firstDay, last_day: p.lastDay,
      duration_min: p.durationMin, sort_order: i,
      interval_days: p.intervalDays || 1,
    };
    if (p.dbId) {
      const { error } = await supabase.from('tracker_practices').update(row).eq('id', p.dbId);
      if (error) { console.error('[DB] Update practice:', error); errors.push(error.message); }
    } else {
      const { error } = await supabase.from('tracker_practices').insert({ ...row, tracker_id: trackerId });
      if (error) { console.error('[DB] Insert practice:', error); errors.push(error.message); }
    }
  }

  if (errors.length) return { id: trackerId, error: errors.join('; ') };
  return { id: trackerId };
}

// ═══════════════════════════════════════════════════════════
// COURSE DELETE
// ═══════════════════════════════════════════════════════════

export async function canDeleteCourse(courseId) {
  const { data, error } = await supabase.rpc('can_delete_course', { p_course_id: courseId });
  if (error) { console.error('[DB] Can delete course:', error); return { canDelete: false, reason: 'Ошибка проверки: ' + error.message }; }
  return { canDelete: data?.can_delete || false, reason: data?.reason || '' };
}

export async function deleteCourse(courseId) {
  const { data, error } = await supabase.rpc('delete_course_safe', { p_course_id: courseId });
  if (error) { console.error('[DB] Delete course:', error); return { canDelete: false, reason: error.message }; }
  return data || { canDelete: false, reason: 'Нет ответа' };
}

// ═══════════════════════════════════════════════════════════
// TRAINER CABINET
// ═══════════════════════════════════════════════════════════

export async function getCourseStudentsInfo(courseId) {
  const { data, error } = await supabase.rpc('get_course_students_info', { p_course_id: courseId });
  if (error) { console.error('[DB] Get course students info:', error); return []; }
  return data || [];
}

export async function getCourseAllStudentsProgress(courseId) {
  const { data, error } = await supabase.rpc('get_course_all_students_progress', { p_course_id: courseId });
  if (error) { console.error('[DB] Get course all progress:', error); return []; }
  // Group by user_id → { day → { activity_id → { elapsed, completed } } }
  const result = {};
  for (const row of (data || [])) {
    if (!result[row.user_id]) result[row.user_id] = {};
    if (!result[row.user_id][row.day]) result[row.user_id][row.day] = {};
    result[row.user_id][row.day][row.activity_id] = {
      elapsed: row.elapsed_seconds,
      completed: row.completed,
    };
  }
  return result;
}

export async function toggleStudentPause(enrollmentId) {
  const { data, error } = await supabase.rpc('toggle_student_pause', { p_enrollment_id: enrollmentId });
  if (error) { console.error('[DB] Toggle pause:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function removeStudentFromCourse(enrollmentId) {
  const { data, error } = await supabase.rpc('remove_student_from_course', { p_enrollment_id: enrollmentId });
  if (error) { console.error('[DB] Remove student:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function changeStudentRole(enrollmentId, newRole) {
  const { data, error } = await supabase.rpc('change_student_role', { p_enrollment_id: enrollmentId, p_new_role: newRole });
  if (error) { console.error('[DB] Change role:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function trainerToggleExclusion(courseId, userId, activityId, day) {
  const { data, error } = await supabase.rpc('trainer_toggle_exclusion', {
    p_course_id: courseId, p_user_id: userId, p_activity_id: activityId, p_day: day,
  });
  if (error) { console.error('[DB] Toggle exclusion:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function trainerAddStudentActivity(courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays) {
  const { data, error } = await supabase.rpc('trainer_add_student_activity', {
    p_course_id: courseId, p_user_id: userId, p_label: label, p_icon_num: iconNum,
    p_duration_min: durationMin, p_first_day: firstDay, p_last_day: lastDay, p_interval_days: intervalDays,
  });
  if (error) { console.error('[DB] Add student activity:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function trainerDeleteStudentActivity(activityId) {
  const { data, error } = await supabase.rpc('trainer_delete_student_activity', { p_activity_id: activityId });
  if (error) { console.error('[DB] Delete student activity:', error); return { success: false, error: error.message }; }
  return data || { success: false };
}

export async function getCourseExclusions(courseId) {
  const { data, error } = await supabase.rpc('get_course_exclusions', { p_course_id: courseId });
  if (error) { console.error('[DB] Get exclusions:', error); return {}; }
  // Group: { user_id: { `${activity_id}_${day}`: true } }
  const result = {};
  for (const row of (data || [])) {
    if (!result[row.user_id]) result[row.user_id] = {};
    result[row.user_id][`${row.activity_id}_${row.day}`] = true;
  }
  return result;
}

export async function getCourseCustomActivities(courseId) {
  const { data, error } = await supabase.rpc('get_course_custom_activities', { p_course_id: courseId });
  if (error) { console.error('[DB] Get custom activities:', error); return []; }
  return data || [];
}

export async function loadStudentExclusions(userId, courseId) {
  const { data, error } = await supabase
    .from('student_activity_exclusions')
    .select('activity_id, day')
    .eq('user_id', userId).eq('course_id', courseId);
  if (error) { console.error('[DB] Load exclusions:', error); return {}; }
  const result = {};
  for (const row of (data || [])) {
    result[`${row.activity_id}_${row.day}`] = true;
  }
  return result;
}

export async function loadStudentCustomActivities(userId, courseId) {
  const { data, error } = await supabase
    .from('student_custom_activities')
    .select('*')
    .eq('user_id', userId).eq('course_id', courseId);
  if (error) { console.error('[DB] Load custom activities:', error); return []; }
  return (data || []).map(a => ({
    id: a.id, activityId: a.id, label: a.label,
    durationMin: a.duration_min, iconNum: a.icon_num || 'health/1',
    firstDay: a.first_day, lastDay: a.last_day,
    intervalDays: a.interval_days || 1, isCustom: true,
  }));
}
