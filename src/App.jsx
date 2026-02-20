import React, { useState, useEffect, useRef } from 'react';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import TimerPage from './pages/Timer';
import DetailsPage from './pages/Details';
import ProfilePage from './pages/Profile';
import RecommendationsPage from './pages/Recommendations';
import AskCoachPage from './pages/AskCoach';
import { defaultProgress } from './data/constants';

export default function App() {
  const [screen, setScreen] = useState("login");
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

  // Persist to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("op_state");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.user) setUser(data.user);
        if (data.currentDay) setCurrentDay(data.currentDay);
        if (data.progress) setProgress(data.progress);
        if (data.user) setScreen("main");
      } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem("op_state", JSON.stringify({ user, currentDay, progress }));
    }
  }, [user, currentDay, progress]);

  // Timer logic
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

  const handleLogin = (userData) => {
    setUser(userData);
    setScreen("main");
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

  // Screens
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
      return <ProfilePage user={user} currentDay={currentDay} progress={progress} onBack={goMain} />;

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
