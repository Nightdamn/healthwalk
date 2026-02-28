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
import Layout from './components/Layout';
import { ACTIVITIES, DAYS_TOTAL, DAY_START_HOUR, getCourseDay } from './data/constants';
import { supabase } from './lib/supabase';
import { loadUserSettings, saveUserSettings, loadAllProgress, saveActivityProgress, checkAndApplyPendingRole, assignRole as dbAssignRole } from './lib/db';

function extractUser(session) {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata || {};
  return {
    id: u.id, email: u.email || "",
    name: meta.full_name || meta.name || meta.preferred_username ||
      (u.email ? u.email.split("@")[0].charAt(0).toUpperCase() + u.email.split("@")[0].slice(1) : "Пользователь"),
    avatar: meta.avatar_url || meta.picture || null,
  };
}

function dbToProgress(dbData) {
  const p = {};
  for (let d = 1; d <= DAYS_TOTAL; d++) {
    p[d] = {};
    ACTIVITIES.forEach((a) => { p[d][a.id] = dbData[d]?.[a.id]?.completed || false; });
  }
  return p;
}

function dbToElapsed(dbData, day) {
  const e = {};
  ACTIVITIES.forEach((a) => { e[a.id] = dbData[day]?.[a.id]?.elapsed || 0; });
  return e;
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('student');

  // Course state
  const [courseStartDate, setCourseStartDate] = useState(null);
  const [tzOffsetMin, setTzOffsetMin] = useState(() => -(new Date().getTimezoneOffset()));
  const [dayStartHour, setDayStartHour] = useState(DAY_START_HOUR);
  const [currentDay, setCurrentDay] = useState(1);
  const [progress, setProgress] = useState({});
  const [elapsedTime, setElapsedTime] = useState({ warmup: 0, standing: 0, sitting: 0, walking: 0 });
  const [dbRawProgress, setDbRawProgress] = useState({});

  // Timer state
  const [activeActivity, setActiveActivity] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerRef = useRef(null);
  const saveIntervalRef = useRef(null);
  const dataLoadedRef = useRef(false);

  // ─── Recalculate current day ───
  const recalcDay = useCallback(() => {
    if (courseStartDate) {
      const day = getCourseDay(courseStartDate, tzOffsetMin, dayStartHour);
      setCurrentDay((prev) => {
        if (prev !== day && user?.id) saveUserSettings(user.id, { current_day: day });
        return day;
      });
    }
  }, [courseStartDate, tzOffsetMin, dayStartHour, user?.id]);

  useEffect(() => {
    recalcDay();
    const interval = setInterval(recalcDay, 30000);
    return () => clearInterval(interval);
  }, [recalcDay]);

  // ─── Load elapsed for current day ───
  useEffect(() => {
    setElapsedTime(dbToElapsed(dbRawProgress, currentDay));
  }, [currentDay, dbRawProgress]);

  // ─── Auth ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) { setSession(s); setUser(extractUser(s)); }
      else setScreen("login");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) { setSession(s); setUser(extractUser(s)); dataLoadedRef.current = false; }
      if (event === "SIGNED_OUT") {
        setSession(null); setUser(null); setUserRole('student'); setProgress({}); setDbRawProgress({});
        setCourseStartDate(null); dataLoadedRef.current = false; setScreen("login");
      }
      if (event === "TOKEN_REFRESHED" && s) setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load data from Supabase ───
  useEffect(() => {
    if (!user?.id || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    (async () => {
      try {
        const [settings, rawProgress] = await Promise.all([
          loadUserSettings(user.id), loadAllProgress(user.id),
        ]);

        // Load and apply role
        const role = await checkAndApplyPendingRole(user.id, user.email);
        setUserRole(role);

        if (settings) {
          setCourseStartDate(settings.course_start_date);
          setTzOffsetMin(settings.tz_offset_min);
          setDayStartHour(settings.day_start_hour ?? DAY_START_HOUR);
          setCurrentDay(settings.current_day);
        }
        setDbRawProgress(rawProgress);
        setProgress(dbToProgress(rawProgress));
        setElapsedTime(dbToElapsed(rawProgress, settings?.current_day || 1));
      } catch (err) { console.error('[App] Load failed:', err); }
      setScreen("main");
    })();
  }, [user?.id]);

  // ─── Timer logic ───
  useEffect(() => {
    if (timerRunning && !timerPaused && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds((s) => s - 1);
        if (activeActivity) setElapsedTime((p) => ({ ...p, [activeActivity.id]: p[activeActivity.id] + 1 }));
      }, 1000);
    }
    if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      if (activeActivity) {
        const t = activeActivity.duration * 60;
        setElapsedTime((p) => ({ ...p, [activeActivity.id]: t }));
        setProgress((p) => ({ ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: true } }));
        setDbRawProgress((p) => ({ ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: { elapsed: t, completed: true } } }));
        if (user?.id) saveActivityProgress(user.id, currentDay, activeActivity.id, t, true);
      }
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerPaused, timerSeconds]);

  // ─── Auto-save every 10s ───
  useEffect(() => {
    if (timerRunning && !timerPaused && activeActivity && user?.id) {
      saveIntervalRef.current = setInterval(() => {
        setElapsedTime((p) => {
          saveActivityProgress(user.id, currentDay, activeActivity.id, p[activeActivity.id] || 0, false);
          return p;
        });
      }, 10000);
    } else clearInterval(saveIntervalRef.current);
    return () => clearInterval(saveIntervalRef.current);
  }, [timerRunning, timerPaused, activeActivity?.id, user?.id, currentDay]);

  const saveCurrentProgress = useCallback(() => {
    if (!activeActivity || !user?.id) return;
    const sec = elapsedTime[activeActivity.id] || 0;
    const completed = progress[currentDay]?.[activeActivity.id] || false;
    saveActivityProgress(user.id, currentDay, activeActivity.id, sec, completed);
    setDbRawProgress((p) => ({ ...p, [currentDay]: { ...p[currentDay], [activeActivity.id]: { elapsed: sec, completed } } }));
  }, [activeActivity, user?.id, currentDay, elapsedTime, progress]);

  // ─── Handlers ───
  const handleLogin = (s) => { setSession(s); setUser(extractUser(s)); };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleStartTimer = (activity) => {
    const remaining = Math.max(0, activity.duration * 60 - (elapsedTime[activity.id] || 0));
    setActiveActivity(activity); setTimerSeconds(remaining);
    setTimerRunning(true); setTimerPaused(true); setScreen("timer");
  };

  const handleTimerPause = () => {
    setTimerPaused((prev) => { if (!prev) saveCurrentProgress(); return !prev; });
  };
  const handleTimerBack = () => { setTimerRunning(false); setTimerPaused(false); saveCurrentProgress(); setScreen("main"); };
  const handleTimerDone = () => { setTimerRunning(false); setTimerPaused(false); setScreen("main"); };

  const handleTimerSeek = (newRemainingSec) => {
    // User dragged the scrubber to rewind
    if (!activeActivity) return;
    const totalSec = activeActivity.duration * 60;
    const newElapsed = totalSec - newRemainingSec;
    setTimerSeconds(newRemainingSec);
    setElapsedTime((p) => ({ ...p, [activeActivity.id]: newElapsed }));
  };

  const goMain = () => setScreen("main");

  const handleSetTimezone = (v) => { setTzOffsetMin(v); if (user?.id) saveUserSettings(user.id, { tz_offset_min: v }); };
  const handleSetDayStartHour = (h) => { setDayStartHour(h); if (user?.id) saveUserSettings(user.id, { day_start_hour: h }); };

  const handleAssignRole = async (email, role) => {
    if (!user?.id) return { success: false, error: 'Не авторизован' };
    return await dbAssignRole(user.id, email, role);
  };

  const handleCourseCreated = (course) => {
    setScreen("my_courses");
  };

  const handleTrackerCreated = () => {
    setScreen("my_trackers");
  };

  /** Get elapsed for a specific day (for viewing past days) */
  const getElapsedForDay = (day) => dbToElapsed(dbRawProgress, day);

  // ─── Loading ───
  if (screen === "loading") {
    return (
      <Layout>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(0,0,0,0.08)", borderTopColor: "#1a1a2e", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 14, color: "#aaa" }}>Загрузка...</span>
        </div>
      </Layout>
    );
  }

  switch (screen) {
    case "login": return <LoginPage onLogin={handleLogin} />;
    case "timer": return (
      <TimerPage activity={activeActivity} timerSeconds={timerSeconds} timerPaused={timerPaused}
        currentDay={currentDay} onPause={handleTimerPause} onBack={handleTimerBack} onDone={handleTimerDone} onSeek={handleTimerSeek} />
    );
    case "details": return <DetailsPage progress={progress} currentDay={currentDay} elapsedTime={elapsedTime} getElapsedForDay={getElapsedForDay} onBack={goMain} />;
    case "profile": return (
      <ProfilePage user={user} currentDay={currentDay} progress={progress}
        tzOffsetMin={tzOffsetMin} dayStartHour={dayStartHour}
        onSetTimezone={handleSetTimezone} onSetDayStartHour={handleSetDayStartHour}
        onBack={goMain} onLogout={handleLogout} />
    );
    case "recommendations": return <RecommendationsPage onBack={goMain} />;
    case "ask": return <AskCoachPage user={user} onBack={goMain} />;
    case "assign_role": return <AssignRolePage onBack={goMain} onAssign={handleAssignRole} />;
    case "my_courses": return <MyCoursesPage user={user} userRole={userRole} onBack={goMain} onNavigate={setScreen} />;
    case "create_course": return <CreateCoursePage user={user} onBack={goMain} onCreated={handleCourseCreated} />;
    case "invite": return <InvitePage user={user} onBack={goMain} />;
    case "my_trackers": return <MyTrackersPage user={user} onBack={goMain} onNavigate={setScreen} />;
    case "create_tracker": return <CreateTrackerPage user={user} onBack={() => setScreen("my_trackers")} onCreated={handleTrackerCreated} />;
    default: return (
      <Dashboard user={user} userRole={userRole} currentDay={currentDay} progress={progress}
        elapsedTime={elapsedTime} dayStartHour={dayStartHour}
        getElapsedForDay={getElapsedForDay}
        onStartTimer={handleStartTimer} onNavigate={setScreen} />
    );
  }
}
