import React, { useState, useEffect, useRef, useCallback } from 'react';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimerPage from './pages/Timer';
import DetailsPage from './pages/Details';
import ProfilePage from './pages/Profile';
import RecommendationsPage from './pages/Recommendations';
import AskCoachPage from './pages/AskCoach';
import Layout from './components/Layout';
import { defaultProgress, getCourseDay, getDefaultStartDate } from './data/constants';
import { supabase } from './lib/supabase';

function extractUser(session) {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || "",
    name:
      meta.full_name || meta.name || meta.preferred_username ||
      (u.email ? u.email.split("@")[0].charAt(0).toUpperCase() + u.email.split("@")[0].slice(1) : "Пользователь"),
    avatar: meta.avatar_url || meta.picture || null,
  };
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // Course state
  const [courseStartDate, setCourseStartDate] = useState(null);
  const [tzOffsetMin, setTzOffsetMin] = useState(() => -(new Date().getTimezoneOffset()));
  const [currentDay, setCurrentDay] = useState(1);
  const [progress, setProgress] = useState(defaultProgress);
  const [elapsedTime, setElapsedTime] = useState({ warmup: 0, standing: 0, sitting: 0, walking: 0 });

  // Timer state
  const [activeActivity, setActiveActivity] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerRef = useRef(null);

  // ─── Recalculate current day ───
  const recalcDay = useCallback(() => {
    if (courseStartDate) {
      const day = getCourseDay(courseStartDate, tzOffsetMin);
      setCurrentDay(day);
    }
  }, [courseStartDate, tzOffsetMin]);

  // Auto-recalculate every 30 seconds (catches 5:00 AM boundary)
  useEffect(() => {
    recalcDay();
    const interval = setInterval(recalcDay, 30000);
    return () => clearInterval(interval);
  }, [recalcDay]);

  // ─── Auth ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        setUser(extractUser(s));
        setScreen("main");
      } else {
        setScreen("login");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) {
        setSession(s);
        setUser(extractUser(s));
        setScreen("main");
      }
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setProgress(defaultProgress());
        setCourseStartDate(null);
        setScreen("login");
      }
      if (event === "TOKEN_REFRESHED" && s) setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Load persisted data when user is known ───
  useEffect(() => {
    if (!user?.id) return;
    const key = `op_data_${user.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.progress) setProgress(data.progress);
        if (data.courseStartDate) setCourseStartDate(data.courseStartDate);
        if (data.tzOffsetMin !== undefined) setTzOffsetMin(data.tzOffsetMin);
      } catch (e) { /* ignore */ }
    } else {
      // First time — set course start to now (5:00 boundary)
      const start = getDefaultStartDate();
      setCourseStartDate(start);
    }
  }, [user?.id]);

  // ─── Save data ───
  useEffect(() => {
    if (!user?.id || !courseStartDate) return;
    localStorage.setItem(
      `op_data_${user.id}`,
      JSON.stringify({ progress, courseStartDate, tzOffsetMin })
    );
  }, [user?.id, progress, courseStartDate, tzOffsetMin]);

  // ─── Reset elapsed time when day changes ───
  useEffect(() => {
    setElapsedTime({ warmup: 0, standing: 0, sitting: 0, walking: 0 });
  }, [currentDay]);

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
    if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      if (activeActivity) {
        setProgress((prev) => ({
          ...prev,
          [currentDay]: { ...prev[currentDay], [activeActivity.id]: true },
        }));
        setElapsedTime((prev) => ({
          ...prev,
          [activeActivity.id]: activeActivity.duration * 60,
        }));
      }
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerPaused, timerSeconds]);

  // ─── Handlers ───
  const handleLogin = (s) => { setSession(s); setUser(extractUser(s)); setScreen("main"); };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleStartTimer = (activity) => {
    setActiveActivity(activity);
    setTimerSeconds(activity.duration * 60);
    setElapsedTime((prev) => ({ ...prev, [activity.id]: 0 }));
    setTimerRunning(true);
    setTimerPaused(false);
    setScreen("timer");
  };

  const handleTimerBack = () => { setTimerRunning(false); setTimerPaused(false); setScreen("main"); };
  const goMain = () => setScreen("main");

  const handleSetTimezone = (offsetMin) => {
    setTzOffsetMin(offsetMin);
    // recalcDay will fire via useEffect
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
        currentDay={currentDay} onPause={() => setTimerPaused(!timerPaused)} onBack={handleTimerBack} onDone={goMain} />
    );
    case "details": return <DetailsPage progress={progress} currentDay={currentDay} onBack={goMain} />;
    case "profile": return (
      <ProfilePage user={user} currentDay={currentDay} progress={progress}
        tzOffsetMin={tzOffsetMin} onSetTimezone={handleSetTimezone}
        onBack={goMain} onLogout={handleLogout} />
    );
    case "recommendations": return <RecommendationsPage onBack={goMain} />;
    case "ask": return <AskCoachPage onBack={goMain} />;
    default: return (
      <Dashboard user={user} currentDay={currentDay} progress={progress}
        elapsedTime={elapsedTime} onStartTimer={handleStartTimer} onNavigate={setScreen} />
    );
  }
}
