import TopBar from '../components/TopBar';
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { glass } from '../styles/shared';
import { isNativeApp, checkForUpdate, startUpdate, APP_VERSION } from '../lib/updater';
import { changePassword, resendVerification, verifyEmail, getMe } from '../lib/api';

const TIMEZONES = [
  { label: "UTC−12 Бейкер", offset: -720 },
  { label: "UTC−11 Ниуэ", offset: -660 },
  { label: "UTC−10 Гавайи", offset: -600 },
  { label: "UTC−9 Аляска", offset: -540 },
  { label: "UTC−8 Лос-Анджелес", offset: -480 },
  { label: "UTC−7 Денвер", offset: -420 },
  { label: "UTC−6 Чикаго", offset: -360 },
  { label: "UTC−5 Нью-Йорк", offset: -300 },
  { label: "UTC−4 Галифакс", offset: -240 },
  { label: "UTC−3 Сан-Паулу", offset: -180 },
  { label: "UTC−2", offset: -120 },
  { label: "UTC−1 Азорские о-ва", offset: -60 },
  { label: "UTC+0 Лондон", offset: 0 },
  { label: "UTC+1 Берлин", offset: 60 },
  { label: "UTC+2 Киев, Калининград", offset: 120 },
  { label: "UTC+3 Москва, Минск", offset: 180 },
  { label: "UTC+4 Самара, Дубай", offset: 240 },
  { label: "UTC+5 Екатеринбург", offset: 300 },
  { label: "UTC+6 Омск, Алматы", offset: 360 },
  { label: "UTC+7 Красноярск, Бангкок", offset: 420 },
  { label: "UTC+8 Иркутск, Сингапур", offset: 480 },
  { label: "UTC+9 Якутск, Токио", offset: 540 },
  { label: "UTC+10 Владивосток", offset: 600 },
  { label: "UTC+11 Магадан", offset: 660 },
  { label: "UTC+12 Камчатка", offset: 720 },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmtH = (h) => `${String(h).padStart(2, "0")}:00`;

const selectStyle = {
  width: "100%", padding: "12px 14px",
  border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: 12,
  fontSize: 14, background: "rgba(255,255,255,0.6)",
  color: "#1a1a2e", cursor: "pointer",
  appearance: "auto", boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function ProfilePage({ user, currentDay, progress, tzOffsetMin, dayStartHour, onSetTimezone, onSetDayStartHour, onBack, onLogout, activeItem }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null); // { available, version, apkUrl, releaseNotes, error }
  const [updateChecking, setUpdateChecking] = useState(false);

  const handleCheckUpdate = async () => {
    setUpdateChecking(true);
    const info = await checkForUpdate();
    setUpdateInfo(info);
    setUpdateChecking(false);
  };

  // Auto-check on mount in native app
  useEffect(() => {
    if (isNativeApp()) handleCheckUpdate();
  }, []);

  const daysTotal = activeItem?.daysCount || 30;
  const activities = activeItem?.activities || [];
  const isDayDone = (day) => {
    const dp = progress[day] || {};
    const acts = activities.filter(a => {
      if (day < a.firstDay || day > a.lastDay) return false;
      const interval = a.intervalDays || 1;
      return (day - a.firstDay) % interval === 0;
    });
    return acts.length > 0 && acts.every(a => dp[a.id]);
  };
  const completedDays = Array.from({ length: daysTotal }, (_, i) => i + 1).filter(d => isDayDone(d)).length;

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await onLogout(); } catch (e) { setLoggingOut(false); }
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 24px 40px", position: "relative", zIndex: 1 }}>
        <TopBar onBack={onBack} title="Профиль" />

        {/* User card */}
        <div style={{ ...glass, borderRadius: 20, padding: 28 }}>
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer"
              style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", display: "block", margin: "0 auto 16px", border: "3px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#1a1a2e" }}>
              {user?.name?.charAt(0)}
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{user?.name}</div>
            <div style={{ fontSize: 14, color: "#888" }}>{user?.email}</div>
            <div style={{ marginTop: 20, padding: 14, background: "rgba(0,0,0,0.02)", borderRadius: 12, fontSize: 14, color: "#555" }}>
              День {currentDay} из {daysTotal} • Завершено: {completedDays}
            </div>
          </div>
        </div>

        {/* ─── Биоритм ─── */}
        <div style={{ ...glass, borderRadius: 16, padding: "20px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
            Биоритм
          </div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
            Настройте границы вашего дня. Прогресс практик считается от начала до конца дня.
          </div>

          {/* Day start hour */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>
              День начинается в
            </div>
            <select
              value={dayStartHour}
              onChange={(e) => onSetDayStartHour(Number(e.target.value))}
              style={selectStyle}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{fmtH(h)}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div style={{
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(26,26,46,0.03)",
            fontSize: 13, color: "#666", lineHeight: 1.5,
          }}>
            День начинается в <strong>{fmtH(dayStartHour)}</strong> и заканчивается в <strong>{fmtH(dayStartHour)}</strong> следующего дня
          </div>
        </div>

        {/* ─── Часовой пояс ─── */}
        <div style={{ ...glass, borderRadius: 16, padding: "18px 20px", marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>
            Часовой пояс
          </div>
          <select
            value={tzOffsetMin}
            onChange={(e) => onSetTimezone(Number(e.target.value))}
            style={selectStyle}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.offset} value={tz.offset}>{tz.label}</option>
            ))}
          </select>
        </div>

        {/* ─── Обновление приложения ─── */}
        <div style={{ ...glass, borderRadius: 16, padding: "18px 20px", marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: updateInfo?.available ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>Версия приложения</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>v{APP_VERSION}</div>
            </div>
            <button onClick={handleCheckUpdate} disabled={updateChecking}
              style={{
                padding: '8px 16px', borderRadius: 10,
                border: '1.5px solid rgba(39,174,96,0.2)', background: 'rgba(39,174,96,0.06)',
                fontSize: 13, fontWeight: 600, color: '#27ae60',
                cursor: updateChecking ? 'wait' : 'pointer',
                opacity: updateChecking ? 0.6 : 1,
              }}>
              {updateChecking ? 'Проверка...' : 'Проверить'}
            </button>
          </div>

          {updateInfo && !updateInfo.available && !updateInfo.error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: 'rgba(39,174,96,0.08)', color: '#27ae60', marginTop: 8,
            }}>
              У вас последняя версия
            </div>
          )}

          {updateInfo?.error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: 'rgba(231,76,60,0.08)', color: '#e74c3c', marginTop: 8,
            }}>
              {updateInfo.error}
            </div>
          )}

          {updateInfo?.available && (
            <div style={{
              padding: '14px', borderRadius: 12, background: 'rgba(39,174,96,0.06)',
              border: '1.5px solid rgba(39,174,96,0.15)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>
                Доступна версия {updateInfo.version}
              </div>
              {updateInfo.releaseNotes && (
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
                  {updateInfo.releaseNotes}
                </div>
              )}
              <button onClick={() => startUpdate(updateInfo.apkUrl)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: 'none', background: '#27ae60', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                Обновить
              </button>
            </div>
          )}
        </div>

        {/* v26: «Вход в аккаунт» — смена/установка пароля + верификация email */}
        <AccountAccessSection user={user} />

        {/* Logout */}
        <button onClick={handleLogout} disabled={loggingOut}
          style={{
            width: "100%", marginTop: 20, padding: 16,
            background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)",
            border: "1.5px solid rgba(200,60,60,0.15)", borderRadius: 16,
            fontSize: 15, fontWeight: 600, color: "#c0392b",
            cursor: loggingOut ? "wait" : "pointer",
            opacity: loggingOut ? 0.6 : 1,
          }}>
          {loggingOut ? "Выход..." : "Выйти из аккаунта"}
        </button>
      </div>
    </Layout>
  );
}

// ─── v26: «Вход в аккаунт» — смена пароля + верификация email ───────────────
function AccountAccessSection({ user }) {
  const [me, setMe] = useState(null);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);

  const clear = () => { setMsg(''); setErr(''); };

  const handleChangePw = async () => {
    clear();
    if (newPw.length < 8) return setErr('Пароль минимум 8 символов');
    if (!/[a-zA-Zа-яА-Я]/.test(newPw) || !/\d/.test(newPw)) return setErr('Пароль должен содержать буквы и цифры');
    if (newPw !== newPw2) return setErr('Пароли не совпадают');
    if (me?.hasPassword && !oldPw) return setErr('Введите текущий пароль');
    setBusy(true);
    try {
      const r = await changePassword(me?.hasPassword ? oldPw : undefined, newPw);
      if (r?.error) setErr(r.error);
      else {
        setMsg('Пароль обновлён');
        setOldPw(''); setNewPw(''); setNewPw2('');
        const fresh = await getMe(); if (fresh) setMe(fresh);
      }
    } catch (e) { setErr(e?.message || 'Ошибка'); }
    finally { setBusy(false); }
  };

  const handleResend = async () => {
    clear(); setBusy(true);
    try { await resendVerification(me?.email || user?.email); setMsg('Код отправлен на email'); }
    catch (e) { setErr(e?.message || 'Ошибка'); }
    finally { setBusy(false); }
  };

  const handleVerify = async () => {
    clear();
    if (!code.trim()) return setErr('Введите код');
    setBusy(true);
    try {
      const r = await verifyEmail(me?.email || user?.email, code.trim());
      if (r?.error) setErr(r.error);
      else {
        setMsg('Email подтверждён');
        setCode('');
        const fresh = await getMe(); if (fresh) setMe(fresh);
      }
    } catch (e) { setErr(e?.message || 'Ошибка'); }
    finally { setBusy(false); }
  };

  if (!me) return null;

  const inp = {
    width: '100%', padding: '10px 12px', border: '1.5px solid rgba(0,0,0,0.08)',
    borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fff', color: '#1a1a2e',
  };
  const btn = (primary) => ({
    padding: '10px 18px', border: 'none', borderRadius: 10,
    background: primary ? '#1a1a2e' : 'rgba(0,0,0,0.04)',
    color: primary ? '#fff' : '#1a1a2e',
    fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ ...glass, borderRadius: 16, padding: 20, marginTop: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Вход в аккаунт</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>{me.email}</div>

      {err && <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(220,50,50,0.08)', color: '#c0392b', fontSize: 13 }}>{err}</div>}
      {msg && <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(39,174,96,0.08)', color: '#27ae60', fontSize: 13 }}>{msg}</div>}

      {/* Email verification */}
      {!me.emailVerified && (
        <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }}
          method="POST" action="/api/auth/verify-email" noValidate
          style={{ marginBottom: 20, padding: 12, borderRadius: 12, background: 'rgba(230,150,30,0.06)', border: '1px solid rgba(230,150,30,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e67e22', marginBottom: 4 }}>Email не подтверждён</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Введите код из письма или отправьте новый.</div>
          {/* Hidden username-подсказка — чтобы Keychain/менеджеры связали
              код с конкретным аккаунтом. */}
          <input type="email" name="email" autoComplete="username" defaultValue={me.email}
            readOnly hidden />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" name="code" id="profile-verify-code" inputMode="numeric"
              placeholder="Код" autoComplete="one-time-code"
              value={code} disabled={busy} maxLength={6}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp, flex: 1, textAlign: 'center', letterSpacing: 4, fontWeight: 600 }} />
            <button type="submit" disabled={busy} style={btn(true)}>Подтвердить</button>
          </div>
          <button type="button" onClick={handleResend} disabled={busy}
            style={{ ...btn(false), fontSize: 12 }}>Отправить снова</button>
        </form>
      )}

      {/* Password change */}
      <form onSubmit={(e) => { e.preventDefault(); handleChangePw(); }}
        method="POST" action="/api/auth/change-password" noValidate>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>
          {me.hasPassword ? 'Смена пароля' : 'Установить пароль'}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          {me.hasPassword ? 'Минимум 8 символов, буквы и цифры.' : 'Позволит входить по email + пароль (в дополнение к Google).'}
        </div>
        {/* Hidden email — для autocomplete=new-password менеджерам нужен
            «username» рядом, иначе они не могут привязать пароль к аккаунту. */}
        <input type="email" name="email" autoComplete="username" defaultValue={me.email}
          readOnly hidden />
        {me.hasPassword && (
          <input type="password" name="current-password" id="profile-old-pw"
            placeholder="Текущий пароль" autoComplete="current-password" required
            value={oldPw} disabled={busy}
            onChange={e => setOldPw(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
        )}
        <input type="password" name="new-password" id="profile-new-pw"
          placeholder="Новый пароль" autoComplete="new-password" required minLength={8}
          value={newPw} disabled={busy}
          onChange={e => setNewPw(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
        <input type="password" name="new-password-confirm" id="profile-new-pw-2"
          placeholder="Повторите новый пароль" autoComplete="new-password" required minLength={8}
          value={newPw2} disabled={busy}
          onChange={e => setNewPw2(e.target.value)}
          style={{ ...inp, marginBottom: 12 }} />
        <button type="submit" disabled={busy} style={btn(true)}>
          {me.hasPassword ? 'Обновить пароль' : 'Установить пароль'}
        </button>
      </form>
    </div>
  );
}
