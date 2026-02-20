import React, { useState, useEffect, useRef } from 'react';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimerPage from './pages/Timer';
import DetailsPage from './pages/Details';
import ProfilePage from './pages/Profile';
import RecommendationsPage from './pages/Recommendations';
import AskCoachPage from './pages/AskCoach';
import Layout from './components/Layout';
import { defaultProgress } from './data/constants';
import { supabase } from './lib/supabase';

// Extract user info from Supabase session
function extractUser(session) {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || "",
    name:
      meta.full_name ||
      meta.name ||
      meta.preferred_username ||
      (u.email ? u.email.split("@")[0].charAt(0).toUpperCase() + u.email.split("@")[0].slice(1) : "Пользователь"),
    avatar: meta.avatar_url || meta.picture || null,
  };
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [currentDay, setCurrentDay] = useState(4);
  const [progress, setProgress] = useState(defaultProgress);
  const [elapsedTime, setElapsedTime] = useState({ warmup: 0, standing: 0, sitting: 0, walking: 0 });

  // Timer state
  const [activeActivity, setActiveActivity] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerRef = useRef(null);

  // ─── Auth: check session on mount & listen for changes ───
  useEffect(() => {
    // 1. Get current session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        setUser(extractUser(s));
        setScreen("main");
      } else {
        setScreen("login");
      }
    });

    // 2. Listen for auth state changes (login, logout, token refresh, OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        console.log("[Auth]", event);
        if (event === "SIGNED_IN" && s) {
          setSession(s);
          setUser(extractUser(s));
          setScreen("main");
        }
        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setProgress(defaultProgress());
          setCurrentDay(4);
          setScreen("login");
        }
        if (event === "TOKEN_REFRESHED" && s) {
          setSession(s);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ─── Persist progress to localStorage (keyed by user id) ───
  useEffect(() => {
    if (user?.id) {
      const key = `op_progress_${user.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.currentDay) setCurrentDay(data.currentDay);
          if (data.progress) setProgress(data.progress);
        } catch (e) { /* ignore */ }
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(
        `op_progress_${user.id}`,
        JSON.stringify({ currentDay, progress })
      );
    }
  }, [user?.id, currentDay, progress]);

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
  const handleLogin = (s) => {
    // Called from LoginPage after successful email/password auth
    setSession(s);
    setUser(extractUser(s));
    setScreen("main");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will handle the rest
  };

  const handleStartTimer = (activity) => {
    setActiveActivity(activity);
    setTimerSeconds(activity.duration * 60);
    setElapsedTime((prev) => ({ ...prev, [activity.id]: 0 }));
    setTimerRunning(true);
    setTimerPaused(false);
    setScreen("timer");
  };

  const handleTimerBack = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    setScreen("main");
  };

  const goMain = () => setScreen("main");

  // ─── Loading screen ───
  if (screen === "loading") {
    return (
      <Layout>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 40, height: 40, border: "3px solid rgba(0,0,0,0.08)",
              borderTopColor: "#1a1a2e", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 14, color: "#aaa", fontWeight: 500 }}>Загрузка...</span>
        </div>
      </Layout>
    );
  }

  // ─── Screens ───
  switch (screen) {
    case "login":
      return <LoginPage onLogin={handleLogin} />;

    case "timer":
      return (
        <TimerPage
          activity={activeActivity}
          timerSeconds={timerSeconds}
          timerPaused={timerPaused}
          currentDay={currentDay}
          onPause={() => setTimerPaused(!timerPaused)}
          onBack={handleTimerBack}
          onDone={goMain}
        />
      );

    case "details":
      return <DetailsPage progress={progress} currentDay={currentDay} onBack={goMain} />;

    case "profile":
      return (
        <ProfilePage
          user={user}
          currentDay={currentDay}
          progress={progress}
          onBack={goMain}
          onLogout={handleLogout}
        />
      );

    case "recommendations":
      return <RecommendationsPage onBack={goMain} />;

    case "ask":
      return <AskCoachPage onBack={goMain} />;

    default:
      return (
        <Dashboard
          user={user}
          currentDay={currentDay}
          setCurrentDay={setCurrentDay}
          progress={progress}
          elapsedTime={elapsedTime}
          onStartTimer={handleStartTimer}
          onNavigate={setScreen}
        />
      );
  }
}
