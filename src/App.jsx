import React, { useState, useEffect, useRef, useCallback } from 'react';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimerPage from './pages/Timer';
import DetailsPage from './pages/Details';
import ProfilePage from './pages/Profile';
import RecommendationsPage from './pages/Recommendations';
import AskCoachPage from './pages/AskCoach';
import AssignRolePage from './pages/AssignRole';
import MyCoursesPage from './pages/MyCourses';
import CreateCoursePage from './pages/CreateCourse';
import InvitePage from './pages/InviteToCourse';
import MyTrackersPage from './pages/MyTrackers';
import CreateTrackerPage from './pages/CreateTracker';
import EditCoursePage from './pages/EditCourse';
import Layout from './components/Layout';
import { DAY_START_HOUR, getCourseDay } from './data/constants';
import { supabase } from './lib/supabase';
import {
  loadUserSettings, saveUserSettings,
  checkAndApplyPendingRole, assignRole as dbAssignRole,
  getAvailableItems, saveActiveContext,
  loadCourseProgress, saveCourseActivityProgress,
  loadTrackerProgress, saveTrackerActivityProgress,
} from './lib/db';

function extractUser(session) {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata || {};
  return {
    id: u.id, email: u.email || '',
    name: meta.full_name || meta.name || meta.preferred_username ||
      (u.email ? u.email.split('@')[0].charAt(0).toUpperCase() + u.email.split('@')[0].slice(1) : 'Пользователь'),
    avatar: meta.avatar_url || meta.picture || null,
  };
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('student');

  // Settings
  const [courseStartDate, setCourseStartDate] = useState(null);
  const [tzOffsetMin, setTzOffsetMin] = useState(() => -(new Date().getTimezoneOffset()));
  const [dayStartHour, setDayStartHour] = useState(DAY_START_HOUR);
  const [currentDay, setCurrentDay] = useState(1);

  // Dynamic context
  const [availableItems, setAvailableItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [editCourseId, setEditCourseId] = useState(null);

  // Progress for active context (keyed by activity UUID)
  const [progress, setProgress] = useState({});       // { day: { actId: true/false } }
  const [rawProgress, setRawProgress] = useState({});  // { day: { actId: { elapsed, completed } } }
  const [elapsedTime, setElapsedTime] = useState({});  // { actId: seconds }

  // Timer
  const [activeActivity, setActiveActivity] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const dataLoadedRef = useRef(false);

  // ─── Helper: build progress/elapsed from raw ───
  const buildFromRaw = useCallback((raw, activities, day) => {
    const p = {};
    const daysCount = activeItem?.daysCount || 30;
    for (let d = 1; d <= daysCount; d++) {
      p[d] = {};
      activities.forEach(a => { p[d][a.id] = raw[d]?.[a.id]?.completed || false; });
    }
    const el = {};
    activities.forEach(a => { el[a.id] = raw[day]?.[a.id]?.elapsed || 0; });
    return { progress: p, elapsed: el };
  }, [activeItem?.daysCount]);

  // ─── Recalculate current day ───
  const recalcDay = useCallback(() => {
    if (!activeItem) return;
    const startDate = activeItem.startDate || courseStartDate;
    if (!startDate) return;
    const day = getCourseDay(startDate, tzOffsetMin, dayStartHour, activeItem.daysCount);
    setCurrentDay(prev => {
      if (prev !== day && user?.id) saveUserSettings(user.id, { current_day: day });
      return day;
    });
  }, [courseStartDate, tzOffsetMin, dayStartHour, user?.id, activeItem]);

  useEffect(() => {
    recalcDay();
    const iv = setInterval(recalcDay, 30000);
    return () => clearInterval(iv);
  }, [recalcDay]);

  // ─── Update elapsed when day changes ───
  useEffect(() => {
    if (!activeItem) return;
    const el = {};
    activeItem.activities.forEach(a => { el[a.id] = rawProgress[currentDay]?.[a.id]?.elapsed || 0; });
    setElapsedTime(el);
  }, [currentDay, rawProgress, activeItem]);

  // ─── Auth ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) { setSession(s); setUser(extractUser(s)); }
      else setScreen('login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' && s) { setSession(s); setUser(extractUser(s)); dataLoadedRef.current = false; }
      if (event === 'SIGNED_OUT') {
        setSession(null); setUser(null); setUserRole('student');
        setProgress({}); setRawProgress({}); setElapsedTime({});
        setCourseStartDate(null); setActiveItem(null); setAvailableItems([]);
        dataLoadedRef.current = false; setScreen('login');
      }
      if (event === 'TOKEN_REFRESHED' && s) setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load data on login ───
  useEffect(() => {
    if (!user?.id || dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    (async () => {
      try {
        const [settings, items, role] = await Promise.all([
          loadUserSettings(user.id),
          getAvailableItems(user.id),
          checkAndApplyPendingRole(user.id, user.email),
        ]);
        setUserRole(role);
        setAvailableItems(items);

        if (settings) {
          setCourseStartDate(settings.course_start_date);
          setTzOffsetMin(settings.tz_offset_min);
          setDayStartHour(settings.day_start_hour ?? DAY_START_HOUR);
        }

        // Restore active context
        let active = null;
        if (settings?.active_type && settings?.active_id) {
          active = items.find(it => it.type === settings.active_type && it.id === settings.active_id);
        }
        if (!active && items.length > 0) active = items[0];

        if (active) {
          setActiveItem(active);
          const raw = active.type === 'course'
            ? await loadCourseProgress(user.id, active.id)
            : await loadTrackerProgress(user.id, active.id);
          setRawProgress(raw);

          // Calculate current day from start date
          const startDate = active.startDate || settings?.course_start_date;
          const dsh = settings?.day_start_hour ?? DAY_START_HOUR;
          const tz = settings?.tz_offset_min ?? -(new Date().getTimezoneOffset());
          let day = startDate ? getCourseDay(startDate, tz, dsh, active.daysCount) : (settings?.current_day || 1);
          day = Math.max(1, day);
          setCurrentDay(day);
          const { progress: p, elapsed: el } = buildFromRaw(raw, active.activities, day);
          setProgress(p);
          setElapsedTime(el);
        }
      } catch (err) { console.error('[App] Load failed:', err); }
      setScreen('main');
    })();
  }, [user?.id]);

  // ─── Switch context ───
  const handleSwitchContext = useCallback(async (item) => {
    if (!user?.id || item.id === activeItem?.id) return;
    setActiveItem(item);
    await saveActiveContext(user.id, item.type, item.id);

    const raw = item.type === 'course'
      ? await loadCourseProgress(user.id, item.id)
      : await loadTrackerProgress(user.id, item.id);
    setRawProgress(raw);

    // Calculate day based on item's own start date
    const startDate = item.startDate || courseStartDate;
    const day = startDate
      ? getCourseDay(startDate, tzOffsetMin, dayStartHour, item.daysCount)
      : 1;
    setCurrentDay(day);
    const p = {};
    for (let d = 1; d <= item.daysCount; d++) {
      p[d] = {};
      item.activities.forEach(a => { p[d][a.id] = raw[d]?.[a.id]?.completed || false; });
    }
    setProgress(p);
    const el = {};
    item.activities.forEach(a => { el[a.id] = raw[day]?.[a.id]?.elapsed || 0; });
    setElapsedTime(el);
  }, [user?.id, activeItem?.id, currentDay]);

  // ─── Save progress helper ───
  const saveProgress = useCallback((actId, elapsed, completed) => {
    if (!user?.id || !activeItem) return;
    if (activeItem.type === 'course') {
      saveCourseActivityProgress(user.id, activeItem.id, actId, currentDay, elapsed, completed);
    } else {
      saveTrackerActivityProgress(user.id, activeItem.id, actId, currentDay, elapsed, completed);
    }
  }, [user?.id, activeItem, currentDay]);

  // ─── Timer logic ───
  useEffect(() => {
    if (timerRunning && !timerPaused && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds(s => s - 1);
        if (activeActivity) {
          setElapsedTime(p => ({ ...p, [activeActivity.id]: (p[activeActivity.id] || 0) + 1 }));
        }
      }, 1000);
    }
    if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      if (activeActivity) {
        const t = activeActivity.duration * 60;
        setElapsedTime(p => ({ ...p, [activeActivity.id]: t }));
        setProgress(p => ({ ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: true } }));
        setRawProgress(p => ({
          ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: { elapsed: t, completed: true } }
        }));
        saveProgress(activeActivity.id, t, true);
      }
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerPaused, timerSeconds]);

  // Auto-save every 10s
  useEffect(() => {
    if (timerRunning && !timerPaused && activeActivity && user?.id) {
      saveIntervalRef.current = setInterval(() => {
        setElapsedTime(p => {
          saveProgress(activeActivity.id, p[activeActivity.id] || 0, false);
          return p;
        });
      }, 10000);
    } else clearInterval(saveIntervalRef.current);
    return () => clearInterval(saveIntervalRef.current);
  }, [timerRunning, timerPaused, activeActivity?.id, user?.id, saveProgress]);

  const saveCurrentProgress = useCallback(() => {
    if (!activeActivity || !user?.id) return;
    const sec = elapsedTime[activeActivity.id] || 0;
    const completed = progress[currentDay]?.[activeActivity.id] || false;
    saveProgress(activeActivity.id, sec, completed);
    setRawProgress(p => ({
      ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: { elapsed: sec, completed } }
    }));
  }, [activeActivity, user?.id, currentDay, elapsedTime, progress, saveProgress]);

  // ─── Handlers ───
  const handleLogin = (s) => { setSession(s); setUser(extractUser(s)); };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleStartTimer = (activity) => {
    // activity: { id, activityId, label, duration, iconNum }
    const remaining = Math.max(0, activity.duration * 60 - (elapsedTime[activity.id] || 0));
    setActiveActivity(activity);
    setTimerSeconds(remaining);
    setTimerRunning(true); setTimerPaused(true);
    setScreen('timer');
  };

  const handleTimerPause = () => {
    setTimerPaused(prev => { if (!prev) saveCurrentProgress(); return !prev; });
  };
  const handleTimerBack = () => { setTimerRunning(false); setTimerPaused(false); saveCurrentProgress(); setScreen('main'); };
  const handleTimerDone = () => { setTimerRunning(false); setTimerPaused(false); setScreen('main'); };

  const handleTimerSeek = (newRemainingSec) => {
    if (!activeActivity) return;
    const totalSec = activeActivity.duration * 60;
    const newElapsed = totalSec - newRemainingSec;
    setTimerSeconds(newRemainingSec);
    setElapsedTime(p => ({ ...p, [activeActivity.id]: newElapsed }));
  };

  const goMain = () => setScreen('main');

  const handleSetTimezone = (v) => { setTzOffsetMin(v); if (user?.id) saveUserSettings(user.id, { tz_offset_min: v }); };
  const handleSetDayStartHour = (h) => { setDayStartHour(h); if (user?.id) saveUserSettings(user.id, { day_start_hour: h }); };

  const handleAssignRole = async (email, role) => {
    if (!user?.id) return { success: false, error: 'Не авторизован' };
    return await dbAssignRole(user.id, email, role);
  };

  const refreshItems = async () => {
    if (!user?.id) return;
    const items = await getAvailableItems(user.id);
    setAvailableItems(items);
    return items;
  };

  const handleCourseCreated = async (course) => {
    const items = await refreshItems();
    const newItem = items?.find(i => i.type === 'course' && i.id === course.id);
    if (newItem) handleSwitchContext(newItem);
    setScreen('my_courses');
  };

  const handleEditCourse = (courseId) => {
    setEditCourseId(courseId);
    setScreen('edit_course');
  };

  const handleCourseSaved = async () => {
    await refreshItems();
    // Reload active item if it's the edited course
    if (activeItem?.type === 'course' && activeItem?.id === editCourseId) {
      const items = await getAvailableItems(user.id);
      setAvailableItems(items);
      const updated = items.find(i => i.type === 'course' && i.id === editCourseId);
      if (updated) setActiveItem(updated);
    }
    setEditCourseId(null);
    setScreen('my_courses');
  };

  const handleTrackerCreated = async (tracker) => {
    const items = await refreshItems();
    const newItem = items?.find(i => i.type === 'tracker' && i.id === tracker.id);
    if (newItem) handleSwitchContext(newItem);
    setScreen('my_trackers');
  };

  const getElapsedForDay = (day) => {
    if (!activeItem) return {};
    const el = {};
    activeItem.activities.forEach(a => { el[a.id] = rawProgress[day]?.[a.id]?.elapsed || 0; });
    return el;
  };

  // ─── Loading ───
  if (screen === 'loading') {
    return (
      <Layout>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(0,0,0,0.08)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 14, color: '#aaa' }}>Загрузка...</span>
        </div>
      </Layout>
    );
  }

  switch (screen) {
    case 'login': return <LoginPage onLogin={handleLogin} />;
    case 'timer': return (
      <TimerPage activity={activeActivity} timerSeconds={timerSeconds} timerPaused={timerPaused}
        currentDay={currentDay} onPause={handleTimerPause} onBack={handleTimerBack} onDone={handleTimerDone} onSeek={handleTimerSeek} />
    );
    case 'details': return <DetailsPage progress={progress} currentDay={currentDay} elapsedTime={elapsedTime} getElapsedForDay={getElapsedForDay} onBack={goMain} activeItem={activeItem} />;
    case 'profile': return (
      <ProfilePage user={user} currentDay={currentDay} progress={progress}
        tzOffsetMin={tzOffsetMin} dayStartHour={dayStartHour}
        onSetTimezone={handleSetTimezone} onSetDayStartHour={handleSetDayStartHour}
        onBack={goMain} onLogout={handleLogout} activeItem={activeItem} />
    );
    case 'recommendations': return <RecommendationsPage onBack={goMain} />;
    case 'ask': return <AskCoachPage user={user} onBack={goMain} />;
    case 'assign_role': return <AssignRolePage onBack={goMain} onAssign={handleAssignRole} />;
    case 'my_courses': return <MyCoursesPage user={user} userRole={userRole} onBack={goMain} onNavigate={setScreen} onEditCourse={handleEditCourse} />;
    case 'create_course': return <CreateCoursePage user={user} onBack={goMain} onCreated={handleCourseCreated} />;
    case 'edit_course': return <EditCoursePage courseId={editCourseId} onBack={() => setScreen('my_courses')} onSaved={handleCourseSaved} />;
    case 'invite': return <InvitePage user={user} onBack={goMain} />;
    case 'my_trackers': return <MyTrackersPage user={user} onBack={goMain} onNavigate={setScreen} />;
    case 'create_tracker': return <CreateTrackerPage user={user} onBack={() => setScreen('my_trackers')} onCreated={handleTrackerCreated} />;
    default: return (
      <Dashboard user={user} userRole={userRole} currentDay={currentDay}
        progress={progress} elapsedTime={elapsedTime} dayStartHour={dayStartHour}
        getElapsedForDay={getElapsedForDay} onStartTimer={handleStartTimer} onNavigate={setScreen}
        activeItem={activeItem} availableItems={availableItems} onSwitchContext={handleSwitchContext} />
    );
  }
}
