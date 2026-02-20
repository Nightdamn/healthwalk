import React, { useState, useEffect, useRef, useCallback } from 'react';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimerPage from './pages/Timer';
import DetailsPage from './pages/Details';
import ProfilePage from './pages/Profile';
import RecommendationsPage from './pages/Recommendations';
import AskCoachPage from './pages/AskCoach';
import Layout from './components/Layout';
import { ACTIVITIES, DAYS_TOTAL, getCourseDay, getDefaultStartDate } from './data/constants';
import { supabase } from './lib/supabase';
import { loadUserSettings, saveUserSettings, loadAllProgress, saveActivityProgress } from './lib/db';

function extractUser(session) {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || "",
    name: meta.full_name || meta.name || meta.preferred_username ||
      (u.email ? u.email.split("@")[0].charAt(0).toUpperCase() + u.email.split("@")[0].slice(1) : "Пользователь"),
    avatar: meta.avatar_url || meta.picture || null,
  };
}

/** Convert DB progress to component format */
function dbToProgress(dbData) {
  const p = {};
  for (let d = 1; d <= DAYS_TOTAL; d++) {
    p[d] = {};
    ACTIVITIES.forEach((a) => {
      p[d][a.id] = dbData[d]?.[a.id]?.completed || false;
    });
  }
  return p;
}

/** Extract elapsed seconds for a specific day */
function dbToElapsed(dbData, day) {
  const e = {};
  ACTIVITIES.forEach((a) => {
    e[a.id] = dbData[day]?.[a.id]?.elapsed || 0;
  });
  return e;
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // Course state
  const [courseStartDate, setCourseStartDate] = useState(null);
  const [tzOffsetMin, setTzOffsetMin] = useState(() => -(new Date().getTimezoneOffset()));
  const [currentDay, setCurrentDay] = useState(1);
  const [progress, setProgress] = useState({});    // { day: { warmup: bool, ... } }
  const [elapsedTime, setElapsedTime] = useState({ warmup: 0, standing: 0, sitting: 0, walking: 0 });
  const [dbRawProgress, setDbRawProgress] = useState({}); // raw DB data for elapsed

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
      const day = getCourseDay(courseStartDate, tzOffsetMin);
      setCurrentDay((prev) => {
        if (prev !== day && user?.id) {
          saveUserSettings(user.id, { current_day: day });
        }
        return day;
      });
    }
  }, [courseStartDate, tzOffsetMin, user?.id]);

  useEffect(() => {
    recalcDay();
    const interval = setInterval(recalcDay, 30000);
    return () => clearInterval(interval);
  }, [recalcDay]);

  // ─── Load elapsed time from DB when day changes ───
  useEffect(() => {
    const elapsed = dbToElapsed(dbRawProgress, currentDay);
    setElapsedTime(elapsed);
  }, [currentDay, dbRawProgress]);

  // ─── Auth ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        setUser(extractUser(s));
        // don't set screen yet — wait for data load
      } else {
        setScreen("login");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) {
        setSession(s);
        setUser(extractUser(s));
        dataLoadedRef.current = false; // trigger reload
      }
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setProgress({});
        setDbRawProgress({});
        setCourseStartDate(null);
        dataLoadedRef.current = false;
        setScreen("login");
      }
      if (event === "TOKEN_REFRESHED" && s) setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Load data from Supabase when user is known ───
  useEffect(() => {
    if (!user?.id || dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    (async () => {
      try {
        // Load settings and progress in parallel
        const [settings, rawProgress] = await Promise.all([
          loadUserSettings(user.id),
          loadAllProgress(user.id),
        ]);

        if (settings) {
          setCourseStartDate(settings.course_start_date);
          setTzOffsetMin(settings.tz_offset_min);
          setCurrentDay(settings.current_day);
        }

        setDbRawProgress(rawProgress);
        setProgress(dbToProgress(rawProgress));

        // Set elapsed for current day
        const day = settings?.current_day || 1;
        setElapsedTime(dbToElapsed(rawProgress, day));
      } catch (err) {
        console.error('[App] Failed to load data:', err);
      }
      setScreen("main");
    })();
  }, [user?.id]);

  // ─── Timer logic ───
  useEffect(() => {
    if (timerRunning && !timerPaused && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds((s) => s - 1);
        if (activeActivity) {
          setElapsedTime((prev) => ({
            ...prev,
            [activeActivity.id]: prev[activeActivity.id] + 1,
          }));
        }
      }, 1000);
    }

    // Timer reached zero — mark completed
    if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      if (activeActivity) {
        const totalSec = activeActivity.duration * 60;

        setElapsedTime((prev) => ({ ...prev, [activeActivity.id]: totalSec }));
        setProgress((prev) => ({
          ...prev,
          [currentDay]: { ...prev[currentDay], [activeActivity.id]: true },
        }));

        // Update raw DB cache
        setDbRawProgress((prev) => ({
          ...prev,
          [currentDay]: {
            ...prev[currentDay],
            [activeActivity.id]: { elapsed: totalSec, completed: true },
          },
        }));

        // Save to DB
        if (user?.id) {
          saveActivityProgress(user.id, currentDay, activeActivity.id, totalSec, true);
        }
      }
    }

    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerPaused, timerSeconds]);

  // ─── Auto-save every 10s while timer is running ───
  useEffect(() => {
    if (timerRunning && !timerPaused && activeActivity && user?.id) {
      saveIntervalRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const sec = prev[activeActivity.id] || 0;
          saveActivityProgress(user.id, currentDay, activeActivity.id, sec, false);
          return prev;
        });
      }, 10000);
    } else {
      clearInterval(saveIntervalRef.current);
    }
    return () => clearInterval(saveIntervalRef.current);
  }, [timerRunning, timerPaused, activeActivity?.id, user?.id, currentDay]);

  // ─── Save progress to DB (on pause / back) ───
  const saveCurrentProgress = useCallback(() => {
    if (!activeActivity || !user?.id) return;
    const sec = elapsedTime[activeActivity.id] || 0;
    const completed = progress[currentDay]?.[activeActivity.id] || false;

    saveActivityProgress(user.id, currentDay, activeActivity.id, sec, completed);

    // Update raw cache
    setDbRawProgress((prev) => ({
      ...prev,
      [currentDay]: {
        ...prev[currentDay],
        [activeActivity.id]: { elapsed: sec, completed },
      },
    }));
  }, [activeActivity, user?.id, currentDay, elapsedTime, progress]);

  // ─── Handlers ───
  const handleLogin = (s) => {
    setSession(s);
    setUser(extractUser(s));
  };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleStartTimer = (activity) => {
    // Resume from saved elapsed_seconds
    const alreadyElapsed = elapsedTime[activity.id] || 0;
    const totalSec = activity.duration * 60;
    const remaining = Math.max(0, totalSec - alreadyElapsed);

    setActiveActivity(activity);
    setTimerSeconds(remaining);
    setTimerRunning(true);
    setTimerPaused(false);
    setScreen("timer");
  };

  const handleTimerPause = () => {
    setTimerPaused((prev) => {
      if (!prev) {
        // Pausing — save to DB
        saveCurrentProgress();
      }
      return !prev;
    });
  };

  const handleTimerBack = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    saveCurrentProgress();
    setScreen("main");
  };

  const handleTimerDone = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    setScreen("main");
  };

  const goMain = () => setScreen("main");

  const handleSetTimezone = (offsetMin) => {
    setTzOffsetMin(offsetMin);
    if (user?.id) saveUserSettings(user.id, { tz_offset_min: offsetMin });
  };

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

  // ─── Screens ───
  switch (screen) {
    case "login": return <LoginPage onLogin={handleLogin} />;
    case "timer": return (
      <TimerPage activity={activeActivity} timerSeconds={timerSeconds} timerPaused={timerPaused}
        currentDay={currentDay} onPause={handleTimerPause} onBack={handleTimerBack} onDone={handleTimerDone} />
    );
    case "details": return <DetailsPage progress={progress} currentDay={currentDay} onBack={goMain} />;
    case "profile": return (
      <ProfilePage user={user} currentDay={currentDay} progress={progress}
        tzOffsetMin={tzOffsetMin} onSetTimezone={handleSetTimezone}
        onBack={goMain} onLogout={handleLogout} />
    );
    case "recommendations": return <RecommendationsPage onBack={goMain} />;
    case "ask": return <AskCoachPage user={user} onBack={goMain} />;
    default: return (
      <Dashboard user={user} currentDay={currentDay} progress={progress}
        elapsedTime={elapsedTime} onStartTimer={handleStartTimer} onNavigate={setScreen} />
    );
  }
}
