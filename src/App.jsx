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
import EditTrackerPage from './pages/EditTracker';
import TrainerCabinetPage from './pages/TrainerCabinet';
import Layout from './components/Layout';
import { MenuProvider } from './components/MenuContext';
import MenuDrawer from './components/MenuDrawer';
import { DAY_START_HOUR, getCourseDay, getCourseDayInfo, isCourseFinished } from './data/constants';
import { isAuthenticated, getMe, signOut as authSignOut, checkOAuthCallback, setToken } from './lib/supabase';
import {
  loadUserSettings, saveUserSettings,
  checkAndApplyPendingRole, getUserRole, assignRole as dbAssignRole,
  getAvailableItems, saveActiveContext,
  loadCourseProgress, saveCourseActivityProgress,
  loadTrackerProgress, saveTrackerActivityProgress,
  loadStudentExclusions, loadStudentCustomActivities,
  getUnreadCount,
  getActivityVideos, getVideoForDay, getVideoSignedUrl, updateVideoDuration,
  getActivityCalls, getCallToken,
} from './lib/db';

function extractUser(userData) {
  if (!userData) return null;
  return {
    id: userData.id, email: userData.email || '',
    name: userData.name || (userData.email ? userData.email.split('@')[0].charAt(0).toUpperCase() + userData.email.split('@')[0].slice(1) : 'Пользователь'),
    avatar: userData.avatar || null,
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
  // Богатый статус для bound_to_calendar курсов: isUpcoming + daysUntilStart
  // нужны Dashboard'у чтобы показать «До начала осталось N дней» вместо
  // «День 1» (когда курс ещё впереди).
  const [dayInfo, setDayInfo] = useState({ day: 1, isUpcoming: false, isFinished: false, isAccessExpired: false, daysUntilStart: 0, daysSinceFinish: 0 });

  // Dynamic context
  const [availableItems, setAvailableItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [editCourseId, setEditCourseId] = useState(null);
  const [editTrackerId, setEditTrackerId] = useState(null);
  const [trainerCourseId, setTrainerCourseId] = useState(null);

  // Progress for active context (keyed by activity UUID)
  const [progress, setProgress] = useState({});       // { day: { actId: true/false } }
  const [rawProgress, setRawProgress] = useState({});  // { day: { actId: { elapsed, completed } } }
  const [elapsedTime, setElapsedTime] = useState({});  // { actId: seconds }
  const [exclusions, setExclusions] = useState({});    // { `actId_day`: true }
  const [customActivities, setCustomActivities] = useState([]); // student-specific activities

  // Unread messages
  const [unreadCount, setUnreadCount] = useState(0);

  // Videos & Calls
  const [courseVideos, setCourseVideos] = useState([]);
  const [courseCalls, setCourseCalls] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

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
    // Для трекеров (isUpcoming недоступен) или курсов без bound_to_calendar
    // getCourseDayInfo всё равно вернёт корректный day; isUpcoming=false.
    const info = getCourseDayInfo(startDate, activeItem.daysCount,
                                  activeItem.accessDaysAfter,
                                  tzOffsetMin, dayStartHour);
    setDayInfo(info);
    // Для дней «до старта» (isUpcoming) currentDay=0 — Dashboard сам решит,
    // что показывать вместо «День X из N».
    const day = info.day;
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

  // ─── Course finished check ───
  const courseFinished = activeItem
    ? isCourseFinished(activeItem.startDate || courseStartDate, tzOffsetMin, dayStartHour, activeItem.daysCount)
    : false;

  // ─── Update elapsed when day changes ───
  useEffect(() => {
    if (!activeItem) return;
    const el = {};
    [...activeItem.activities, ...customActivities].forEach(a => { el[a.id] = rawProgress[currentDay]?.[a.id]?.elapsed || 0; });
    setElapsedTime(el);
  }, [currentDay, rawProgress, activeItem, customActivities]);

  // ─── Auth ───
  useEffect(() => {
    // Check for OAuth callback token in URL hash
    checkOAuthCallback();

    if (isAuthenticated()) {
      getMe().then(userData => {
        if (userData) {
          setSession({}); // dummy session object for compatibility
          setUser(extractUser(userData));
        } else {
          setToken(null);
          setScreen('login');
        }
      });
    } else {
      setScreen('login');
    }
  }, []);

  // ─── Load data on login ───
  useEffect(() => {
    if (!user?.id || dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    (async () => {
      try {
        const [settings, items, role, unread] = await Promise.all([
          loadUserSettings(user.id),
          getAvailableItems(user.id),
          checkAndApplyPendingRole(user.id, user.email),
          getUnreadCount(),
        ]);
        setUserRole(role);
        setAvailableItems(items);
        setUnreadCount(unread);

        if (settings) {
          setCourseStartDate(settings.course_start_date);
          setTzOffsetMin(settings.tz_offset_min);
          setDayStartHour(settings.day_start_hour ?? DAY_START_HOUR);
        }

        // Restore active context.
        //   1) server-side user_settings.active_type/_id (canonical)
        //   2) localStorage fallback per user (instant, survives even if
        //      a previous saveActiveContext failed network-side)
        //   3) first available item
        let active = null;
        if (settings?.active_type && settings?.active_id) {
          active = items.find(it => it.type === settings.active_type && it.id === settings.active_id);
        }
        if (!active) {
          try {
            const raw = localStorage.getItem(`hw.activeCtx.${user.id}`);
            if (raw) {
              const saved = JSON.parse(raw);
              active = items.find(it => it.type === saved.type && it.id === saved.id);
            }
          } catch (_) {}
        }
        if (!active && items.length > 0) active = items[0];

        if (active) {
          setActiveItem(active);
          const loadPromises = [
            active.type === 'course'
              ? loadCourseProgress(user.id, active.id)
              : loadTrackerProgress(user.id, active.id),
          ];
          if (active.type === 'course') {
            loadPromises.push(
              loadStudentExclusions(user.id, active.id),
              loadStudentCustomActivities(user.id, active.id),
              getActivityVideos(active.id),
              getActivityCalls(active.id),
            );
          }
          const [raw, excl, custom, vids, calls] = await Promise.all(loadPromises);
          setRawProgress(raw);
          if (active.type === 'course') {
            setExclusions(excl || {});
            setCustomActivities(custom || []);
            setCourseVideos(vids || []);
            setCourseCalls(calls || []);
          } else {
            setExclusions({});
            setCustomActivities([]);
            setCourseVideos([]);
            setCourseCalls([]);
          }

          // Calculate current day from start date
          const startDate = active.startDate || settings?.course_start_date;
          const dsh = settings?.day_start_hour ?? DAY_START_HOUR;
          const tz = settings?.tz_offset_min ?? -(new Date().getTimezoneOffset());
          let day = startDate ? getCourseDay(startDate, tz, dsh, active.daysCount) : (settings?.current_day || 1);
          day = Math.max(1, day);
          setCurrentDay(day);
          const allActs = [...active.activities, ...(custom || [])];
          const { progress: p, elapsed: el } = buildFromRaw(raw, allActs, day);
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
    // Write to localStorage synchronously BEFORE the network call so a
    // reload mid-flight still picks up the latest choice.
    try {
      localStorage.setItem(
        `hw.activeCtx.${user.id}`,
        JSON.stringify({ type: item.type, id: item.id }),
      );
    } catch (_) {}
    await saveActiveContext(user.id, item.type, item.id);

    const loadPromises = [
      item.type === 'course'
        ? loadCourseProgress(user.id, item.id)
        : loadTrackerProgress(user.id, item.id),
    ];
    if (item.type === 'course') {
      loadPromises.push(
        loadStudentExclusions(user.id, item.id),
        loadStudentCustomActivities(user.id, item.id),
        getActivityVideos(item.id),
        getActivityCalls(item.id),
      );
    }
    const [raw, excl, custom, vids, calls] = await Promise.all(loadPromises);
    setRawProgress(raw);
    if (item.type === 'course') {
      setExclusions(excl || {});
      setCustomActivities(custom || []);
      setCourseVideos(vids || []);
      setCourseCalls(calls || []);
    } else {
      setExclusions({});
      setCustomActivities([]);
      setCourseVideos([]);
      setCourseCalls([]);
    }

    // Calculate day based on item's own start date
    const startDate = item.startDate || courseStartDate;
    const day = startDate
      ? getCourseDay(startDate, tzOffsetMin, dayStartHour, item.daysCount)
      : 1;
    setCurrentDay(day);
    const allActs = [...item.activities, ...(custom || [])];
    const p = {};
    for (let d = 1; d <= item.daysCount; d++) {
      p[d] = {};
      allActs.forEach(a => { p[d][a.id] = raw[d]?.[a.id]?.completed || false; });
    }
    setProgress(p);
    const el = {};
    allActs.forEach(a => { el[a.id] = raw[day]?.[a.id]?.elapsed || 0; });
    setElapsedTime(el);
  }, [user?.id, activeItem?.id, currentDay]);

  // ─── Save progress helper ───
  const saveProgress = useCallback((actId, elapsed, completed, dayOverride) => {
    if (!user?.id || !activeItem) return;
    const day = dayOverride ?? currentDay;
    if (activeItem.type === 'course') {
      saveCourseActivityProgress(user.id, activeItem.id, actId, day, elapsed, completed);
    } else {
      saveTrackerActivityProgress(user.id, activeItem.id, actId, day, elapsed, completed);
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
        const t = activeVideo?.duration_sec || activeActivity.duration * 60;
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
  const handleLogin = (userData) => {
    setSession({});
    setUser(extractUser(userData));
    dataLoadedRef.current = false;
  };
  const handleLogout = () => {
    authSignOut();
    setSession(null); setUser(null); setUserRole('student');
    setProgress({}); setRawProgress({}); setElapsedTime({});
    setCourseStartDate(null); setActiveItem(null); setAvailableItems([]);
    dataLoadedRef.current = false; setScreen('login');
  };

  const handleStartTimer = async (activity) => {
    // Normalize activity props
    activity = { ...activity, practiceType: activity.practiceType || 'media', descriptionHtml: activity.descriptionHtml || null };

    // Find call for call-type activities
    if (activity.practiceType === 'call') {
      const call = courseCalls.find(c => c.activity_id === activity.activityId && c.day === currentDay && c.status !== 'cancelled');
      setActiveCall(call || null);
    } else {
      setActiveCall(null);
    }

    // Find video for this activity and day
    const video = getVideoForDay(courseVideos, activity.id, currentDay);
    setActiveVideo(video);

    // Get signed URL for file videos
    if (video?.video_type === 'file' && video?.video_url) {
      const url = await getVideoSignedUrl(video.video_url);
      setActiveVideoUrl(url);
    } else {
      setActiveVideoUrl(null);
    }

    const totalSec = video?.duration_sec ?? (activity.duration * 60);
    const remaining = Math.max(0, totalSec - (elapsedTime[activity.id] || 0));
    setActiveActivity(activity);
    setTimerSeconds(remaining);
    setTimerRunning(true); setTimerPaused(true);
    setScreen('timer');
  };

  const handleTimerPause = () => {
    setTimerPaused(prev => { if (!prev) saveCurrentProgress(); return !prev; });
  };
  const handleTimerBack = () => { setTimerRunning(false); setTimerPaused(false); saveCurrentProgress(); setScreen('main'); };
  const handleTimerDone = () => {
    // For theory + call_recording — отмечаем как выполненное сразу
    // (таймер не тикает; пользователь нажал «Изучено»/«Просмотрено»).
    // call_recording приходит с полем `day` (день записи, не текущий), потому
    // что просмотр может быть из другого дня календаря — сохраняем в тот день,
    // где практика реально лежит, иначе в БД зачёт уедет в currentDay и на
    // карточке дня 1 останется «не выполнено».
    if (activeActivity?.practiceType === 'theory' || activeActivity?.practiceType === 'call_recording') {
      const t = (activeActivity.duration || 1) * 60;
      const targetDay = activeActivity.day ?? currentDay;
      setElapsedTime(p => ({ ...p, [activeActivity.id]: t }));
      setProgress(p => ({ ...p, [targetDay]: { ...p[targetDay], [activeActivity.id]: true } }));
      setRawProgress(p => ({
        ...p, [targetDay]: { ...p[targetDay], [activeActivity.id]: { elapsed: t, completed: true } }
      }));
      saveProgress(activeActivity.id, t, true, targetDay);
    }
    setTimerRunning(false); setTimerPaused(false); setScreen('main');
  };

  const handleTimerSeek = (newRemainingSec) => {
    if (!activeActivity) return;
    const totalSec = activeVideo?.duration_sec || activeActivity.duration * 60;
    const newElapsed = totalSec - newRemainingSec;
    setTimerSeconds(newRemainingSec);
    setElapsedTime(p => ({ ...p, [activeActivity.id]: newElapsed }));
  };

  const handleDurationDetected = async (videoId, durationSec) => {
    // Update DB
    await updateVideoDuration(videoId, durationSec);
    // Update local video state
    setActiveVideo(prev => prev ? { ...prev, duration_sec: durationSec } : prev);
    setCourseVideos(prev => prev.map(v => v.id === videoId ? { ...v, duration_sec: durationSec } : v));
    // Reset timer to new duration
    if (activeActivity) {
      const currentElapsed = elapsedTime[activeActivity.id] || 0;
      setTimerSeconds(Math.max(0, durationSec - currentElapsed));
    }
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

  const refreshUnread = useCallback(async () => {
    if (!user?.id) return;
    const count = await getUnreadCount();
    setUnreadCount(count);
  }, [user?.id]);

  const refreshRole = async () => {
    if (!user?.id) return;
    const role = await getUserRole(user.id);
    setUserRole(role);
  };

  const handleCourseCreated = async (course) => {
    const items = await refreshItems();
    const newItem = items?.find(i => i.type === 'course' && i.id === course.id);
    if (newItem) handleSwitchContext(newItem);
    // Open in edit mode so user can add videos right away
    setEditCourseId(course.id);
    setScreen('edit_course');
  };

  const handleEditCourse = (courseId) => {
    setEditCourseId(courseId);
    setScreen('edit_course');
  };

  const handleTrainerCabinet = (courseId) => {
    setTrainerCourseId(courseId);
    setScreen('trainer_cabinet');
  };

  const handleEditCourseBack = async () => {
    // Editor auto-saves while open, so on back we just need to refresh
    // course list + active context so the dashboard reflects the latest state.
    await refreshItems();
    if (editCourseId && activeItem?.type === 'course' && activeItem?.id === editCourseId) {
      const [items, vids, calls] = await Promise.all([
        getAvailableItems(user.id),
        getActivityVideos(editCourseId),
        getActivityCalls(editCourseId),
      ]);
      setAvailableItems(items);
      setCourseVideos(vids || []);
      setCourseCalls(calls || []);
      const updated = items.find(i => i.type === 'course' && i.id === editCourseId);
      if (updated) setActiveItem(updated);
    }
    setScreen('my_courses');
  };

  // Refresh data when the editor saves but stay on the editor — the user
  // explicitly clicks the back arrow when they're done.
  const handleCourseSaved = async () => {
    await refreshItems();
    if (activeItem?.type === 'course' && activeItem?.id === editCourseId) {
      const [items, vids, calls] = await Promise.all([
        getAvailableItems(user.id),
        getActivityVideos(editCourseId),
        getActivityCalls(editCourseId),
      ]);
      setAvailableItems(items);
      setCourseVideos(vids || []);
      setCourseCalls(calls || []);
      const updated = items.find(i => i.type === 'course' && i.id === editCourseId);
      if (updated) setActiveItem(updated);
    }
  };

  const handleTrackerCreated = async (tracker) => {
    const items = await refreshItems();
    const newItem = items?.find(i => i.type === 'tracker' && i.id === tracker.id);
    if (newItem) handleSwitchContext(newItem);
    setScreen('my_trackers');
  };

  const handleEditTracker = (trackerId) => {
    setEditTrackerId(trackerId);
    setScreen('edit_tracker');
  };

  const handleTrackerSaved = async () => {
    await refreshItems();
    if (activeItem?.type === 'tracker' && activeItem?.id === editTrackerId) {
      const items = await getAvailableItems(user.id);
      setAvailableItems(items);
      const updated = items.find(i => i.type === 'tracker' && i.id === editTrackerId);
      if (updated) setActiveItem(updated);
    }
    setEditTrackerId(null);
    setScreen('my_trackers');
  };

  const handleCourseDeleted = async () => {
    const wasActive = activeItem?.type === 'course' && activeItem?.id === editCourseId;
    const items = await refreshItems();
    if (wasActive) {
      if (items?.length) handleSwitchContext(items[0]);
      else setActiveItem(null);
    }
    setEditCourseId(null);
    setScreen('my_courses');
  };

  const getElapsedForDay = (day) => {
    if (!activeItem) return {};
    const el = {};
    [...activeItem.activities, ...customActivities].forEach(a => { el[a.id] = rawProgress[day]?.[a.id]?.elapsed || 0; });
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

  const renderPage = () => {
    switch (screen) {
    case 'login': return <LoginPage onLogin={handleLogin} />;
    case 'timer': return (
      <TimerPage activity={activeActivity} timerSeconds={timerSeconds} timerPaused={timerPaused}
        currentDay={currentDay} onPause={handleTimerPause} onBack={handleTimerBack} onDone={handleTimerDone} onSeek={handleTimerSeek}
        video={activeVideo} videoUrl={activeVideoUrl} onDurationDetected={handleDurationDetected}
        activeCall={activeCall} getCallToken={getCallToken} tzOffsetMin={tzOffsetMin} />
    );
    case 'details': return <DetailsPage progress={progress} currentDay={currentDay} elapsedTime={elapsedTime} getElapsedForDay={getElapsedForDay} onBack={goMain} activeItem={activeItem} exclusions={exclusions} customActivities={customActivities} />;
    case 'profile': return (
      <ProfilePage user={user} currentDay={currentDay} progress={progress}
        tzOffsetMin={tzOffsetMin} dayStartHour={dayStartHour}
        onSetTimezone={handleSetTimezone} onSetDayStartHour={handleSetDayStartHour}
        onBack={goMain} onLogout={handleLogout} activeItem={activeItem} />
    );
    case 'recommendations': return <RecommendationsPage onBack={goMain} />;
    case 'ask': return <AskCoachPage user={user} onBack={goMain} availableItems={availableItems} activeItem={activeItem} onUnreadChange={refreshUnread} />;
    case 'assign_role': return <AssignRolePage onBack={goMain} onAssign={handleAssignRole} />;
    case 'my_courses': return <MyCoursesPage user={user} userRole={userRole} onBack={goMain} onNavigate={setScreen} onEditCourse={handleEditCourse} onTrainerCabinet={handleTrainerCabinet} onRefresh={refreshItems} availableItems={availableItems} />;
    case 'create_course': return <CreateCoursePage user={user} onBack={() => setScreen('my_courses')} onCreated={handleCourseCreated} />;
    case 'edit_course': return <EditCoursePage courseId={editCourseId} onBack={handleEditCourseBack} onSaved={handleCourseSaved} onDeleted={handleCourseDeleted} tzOffsetMin={tzOffsetMin} />;
    case 'trainer_cabinet': return <TrainerCabinetPage courseId={trainerCourseId} user={user} onBack={() => setScreen('my_courses')} onRefreshRole={refreshRole} onEditCourse={handleEditCourse} />;
    case 'invite': return <InvitePage user={user} onBack={() => setScreen('my_courses')} />;
    case 'my_trackers': return <MyTrackersPage user={user} onBack={goMain} onNavigate={setScreen} onEditTracker={handleEditTracker} />;
    case 'create_tracker': return <CreateTrackerPage user={user} onBack={() => setScreen('my_trackers')} onCreated={handleTrackerCreated} />;
    case 'edit_tracker': return <EditTrackerPage trackerId={editTrackerId} onBack={() => setScreen('my_trackers')} onSaved={handleTrackerSaved} />;
    default: return (
      <Dashboard user={user} userRole={userRole} currentDay={currentDay}
        progress={progress} elapsedTime={elapsedTime} dayStartHour={dayStartHour}
        getElapsedForDay={getElapsedForDay} onStartTimer={handleStartTimer} onNavigate={setScreen}
        activeItem={activeItem} availableItems={availableItems} onSwitchContext={handleSwitchContext}
        exclusions={exclusions} customActivities={customActivities}
        unreadCount={unreadCount} courseFinished={courseFinished} dayInfo={dayInfo}
        courseCalls={courseCalls} />
    );
    }
  };

  // login-страница рендерится без MenuProvider (там нет шапки / меню)
  if (screen === 'login') return renderPage();

  return (
    <MenuProvider>
      {renderPage()}
      <MenuDrawer
        user={user}
        userRole={userRole}
        availableItems={availableItems}
        activeItem={activeItem}
        onSwitchContext={handleSwitchContext}
        onNavigate={setScreen}
        unreadCount={unreadCount}
      />
    </MenuProvider>
  );
}
