import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { LogoFull } from '../components/Icons';
import {
  signInWithPassword, signUp, signInWithGoogle, verifyEmail, resendVerification,
  requestPasswordReset, confirmPasswordReset, getGeo,
} from '../lib/supabase';

// v26: единая страница входа/регистрации/верификации/восстановления пароля.
// Google-кнопка автоматически скрывается для RU-IP (гугл заблокирован из России).

const MODES = {
  LOGIN: 'login',
  REGISTER: 'register',
  VERIFY: 'verify',
  RESET_REQUEST: 'reset_request',
  RESET_CONFIRM: 'reset_confirm',
};

const inputStyle = {
  width: '100%', padding: '14px 16px', border: '1.5px solid rgba(0,0,0,0.06)',
  borderRadius: 12, fontSize: 15, background: 'rgba(255,255,255,0.6)',
  color: '#1a1a2e', boxSizing: 'border-box', transition: 'border-color 0.2s',
};

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hideGoogle, setHideGoogle] = useState(false);
  const [verifyEmailAddr, setVerifyEmailAddr] = useState(''); // на кого послан код

  // Гео-определение при загрузке: RU → скрываем Google
  useEffect(() => {
    getGeo().then(g => {
      if (g?.country === 'RU') setHideGoogle(true);
    }).catch(() => {});
  }, []);

  const clearMsgs = () => { setError(''); setMessage(''); };
  const switchMode = (m) => { setMode(m); clearMsgs(); setCode(''); setPassword(''); setPassword2(''); };

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('Введите email и пароль');
    setLoading(true); clearMsgs();
    try {
      const data = await signInWithPassword(email.trim(), password);
      if (data.error) { setError(data.error); return; }
      if (data.token) {
        // Если email не подтверждён — сразу отправить на verify.
        if (!data.user?.emailVerified) {
          setVerifyEmailAddr(data.user.email);
          setMode(MODES.VERIFY);
          setMessage('Ваш email не подтверждён. Введите код из письма (или нажмите «Отправить снова»).');
          return;
        }
        onLogin(data.user);
      }
    } catch (err) { setError(err?.message || 'Ошибка входа'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) return setError('Введите имя');
    if (!email.trim()) return setError('Введите email');
    if (password.length < 8) return setError('Пароль минимум 8 символов');
    if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) return setError('Пароль должен содержать буквы и цифры');
    if (password !== password2) return setError('Пароли не совпадают');
    if (!consent) return setError('Отметьте согласие на обработку персональных данных');
    setLoading(true); clearMsgs();
    try {
      const data = await signUp(email.trim(), password, name.trim(), true);
      if (data.error) { setError(data.error); return; }
      if (data.token) {
        setVerifyEmailAddr(data.user.email);
        setMode(MODES.VERIFY);
        setMessage('На ваш email отправлен код подтверждения. Введите его ниже.');
      }
    } catch (err) { setError(err?.message || 'Ошибка регистрации'); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!code.trim()) return setError('Введите код');
    setLoading(true); clearMsgs();
    try {
      const r = await verifyEmail(verifyEmailAddr || email.trim(), code.trim());
      if (r.error) { setError(r.error); return; }
      // После успешной верификации подхватим текущего залогиненного юзера.
      // Он уже логин'ed после register → onLogin из /me.
      const { getMe } = await import('../lib/supabase');
      const u = await getMe();
      if (u) onLogin(u);
      else setMessage('Email подтверждён. Войдите в аккаунт.');
    } catch (err) { setError(err?.message || 'Ошибка проверки'); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setLoading(true); clearMsgs();
    try {
      await resendVerification(verifyEmailAddr || email.trim());
      setMessage('Новый код отправлен на email.');
    } catch (err) { setError(err?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const handleResetRequest = async () => {
    if (!email.trim()) return setError('Введите email');
    setLoading(true); clearMsgs();
    try {
      await requestPasswordReset(email.trim());
      setMessage('Если email зарегистрирован — на него отправлен код восстановления.');
      setMode(MODES.RESET_CONFIRM);
    } catch (err) { setError(err?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const handleResetConfirm = async () => {
    if (!email.trim() || !code.trim()) return setError('Введите email и код');
    if (password.length < 8) return setError('Пароль минимум 8 символов');
    if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) return setError('Пароль должен содержать буквы и цифры');
    if (password !== password2) return setError('Пароли не совпадают');
    setLoading(true); clearMsgs();
    try {
      const r = await confirmPasswordReset(email.trim(), code.trim(), password);
      if (r.error) { setError(r.error); return; }
      setMessage('Пароль изменён. Войдите с новым паролем.');
      setMode(MODES.LOGIN); setPassword(''); setPassword2(''); setCode('');
    } catch (err) { setError(err?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const handleGoogle = () => { setLoading(true); clearMsgs(); signInWithGoogle(); };

  return (
    <Layout>
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 28px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ marginBottom: 16 }}><LogoFull height={56} /></div>
        <p style={{ fontSize: 15, color: '#8a8a9a', margin: '0 0 40px', fontWeight: 400 }}>
          Сейчас самое время сделать первый шаг
        </p>

        <div style={{
          width: '100%', maxWidth: 360, background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 20, padding: '28px 24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.8)',
        }}>
          {/* Tabs — только для login/register */}
          {(mode === MODES.LOGIN || mode === MODES.REGISTER) && (
            <div style={{ display: 'flex', marginBottom: 20, background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: 3 }}>
              {[MODES.LOGIN, MODES.REGISTER].map(m => (
                <button key={m} onClick={() => switchMode(m)}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s',
                    background: mode === m ? '#fff' : 'transparent',
                    color: mode === m ? '#1a1a2e' : '#8a8a9a',
                    boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  }}>
                  {m === MODES.LOGIN ? 'Вход' : 'Регистрация'}
                </button>
              ))}
            </div>
          )}

          {mode === MODES.VERIFY && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Подтверждение email</div>
              <div style={{ fontSize: 13, color: '#8a8a9a' }}>Код отправлен на {verifyEmailAddr || email}</div>
            </div>
          )}
          {mode === MODES.RESET_REQUEST && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Восстановление пароля</div>
              <div style={{ fontSize: 13, color: '#8a8a9a' }}>Введите email — мы отправим код</div>
            </div>
          )}
          {mode === MODES.RESET_CONFIRM && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Новый пароль</div>
              <div style={{ fontSize: 13, color: '#8a8a9a' }}>Введите код из письма и новый пароль</div>
            </div>
          )}

          {error && <Alert type="error">{error}</Alert>}
          {message && <Alert type="success">{message}</Alert>}

          {/* ─── LOGIN ─── */}
          {mode === MODES.LOGIN && (
            <>
              <input type="email" placeholder="Email" value={email} disabled={loading}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="password" placeholder="Пароль" value={password} disabled={loading}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ ...inputStyle, marginBottom: 6 }} />
              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <button type="button" onClick={() => switchMode(MODES.RESET_REQUEST)}
                  style={linkStyle}>Забыли пароль?</button>
              </div>
              <PrimaryButton onClick={handleLogin} loading={loading}>Войти</PrimaryButton>
              {!hideGoogle && <><Divider /><GoogleButton onClick={handleGoogle} loading={loading} /></>}
            </>
          )}

          {/* ─── REGISTER ─── */}
          {mode === MODES.REGISTER && (
            <>
              <input type="text" placeholder="Имя" value={name} disabled={loading}
                onChange={e => setName(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="email" placeholder="Email" value={email} disabled={loading}
                onChange={e => setEmail(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="password" placeholder="Пароль (мин 8 символов, буквы + цифры)" value={password} disabled={loading}
                onChange={e => setPassword(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="password" placeholder="Повторите пароль" value={password2} disabled={loading}
                onChange={e => setPassword2(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()}
                style={{ ...inputStyle, marginBottom: 14 }} />
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 18, cursor: 'pointer', fontSize: 12, color: '#666', lineHeight: 1.4 }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  disabled={loading} style={{ marginTop: 2 }} />
                <span>
                  Согласен с обработкой персональных данных согласно{' '}
                  <a href="/policy" target="_blank" rel="noopener" style={{ color: '#27ae60', textDecoration: 'underline' }}>Политике конфиденциальности</a>
                </span>
              </label>
              <PrimaryButton onClick={handleRegister} loading={loading}>Зарегистрироваться</PrimaryButton>
              {!hideGoogle && <><Divider /><GoogleButton onClick={handleGoogle} loading={loading} /></>}
            </>
          )}

          {/* ─── VERIFY EMAIL ─── */}
          {mode === MODES.VERIFY && (
            <>
              <input type="text" inputMode="numeric" placeholder="Код из письма (6 цифр)" value={code}
                disabled={loading} maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                style={{ ...inputStyle, marginBottom: 14, textAlign: 'center', fontSize: 20, letterSpacing: 6, fontWeight: 600 }} />
              <PrimaryButton onClick={handleVerify} loading={loading}>Подтвердить</PrimaryButton>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" onClick={handleResend} disabled={loading} style={linkStyle}>
                  Отправить код снова
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button type="button" onClick={() => switchMode(MODES.LOGIN)} style={linkStyle}>← Ко входу</button>
              </div>
            </>
          )}

          {/* ─── RESET REQUEST ─── */}
          {mode === MODES.RESET_REQUEST && (
            <>
              <input type="email" placeholder="Email" value={email} disabled={loading}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleResetRequest()}
                style={{ ...inputStyle, marginBottom: 16 }} />
              <PrimaryButton onClick={handleResetRequest} loading={loading}>Отправить код</PrimaryButton>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" onClick={() => switchMode(MODES.LOGIN)} style={linkStyle}>← Ко входу</button>
              </div>
            </>
          )}

          {/* ─── RESET CONFIRM ─── */}
          {mode === MODES.RESET_CONFIRM && (
            <>
              <input type="email" placeholder="Email" value={email} disabled={loading}
                onChange={e => setEmail(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="text" inputMode="numeric" placeholder="Код из письма" value={code} disabled={loading} maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputStyle, marginBottom: 10, textAlign: 'center', fontSize: 18, letterSpacing: 4, fontWeight: 600 }} />
              <input type="password" placeholder="Новый пароль" value={password} disabled={loading}
                onChange={e => setPassword(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <input type="password" placeholder="Повторите пароль" value={password2} disabled={loading}
                onChange={e => setPassword2(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleResetConfirm()}
                style={{ ...inputStyle, marginBottom: 14 }} />
              <PrimaryButton onClick={handleResetConfirm} loading={loading}>Установить пароль</PrimaryButton>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" onClick={() => switchMode(MODES.LOGIN)} style={linkStyle}>← Ко входу</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Alert({ type, children }) {
  const isErr = type === 'error';
  return (
    <div style={{
      padding: '10px 14px', marginBottom: 16, borderRadius: 10,
      background: isErr ? 'rgba(220,50,50,0.08)' : 'rgba(39,174,96,0.08)',
      color: isErr ? '#c0392b' : '#27ae60',
      fontSize: 13, fontWeight: 500, lineHeight: 1.4,
    }}>{children}</div>
  );
}

function PrimaryButton({ onClick, loading, children }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        width: '100%', padding: '15px', background: '#1a1a2e', color: '#fff',
        border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
      {loading ? 'Загрузка...' : children}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
      <span style={{ fontSize: 12, color: '#aaa', fontWeight: 500 }}>или</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
    </div>
  );
}

function GoogleButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        width: '100%', padding: '14px', background: 'rgba(255,255,255,0.8)', color: '#333',
        border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14,
        fontSize: 14, fontWeight: 500, cursor: loading ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: loading ? 0.7 : 1,
      }}>
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      Войти через Google
    </button>
  );
}

const linkStyle = {
  background: 'none', border: 'none', padding: 0, color: '#8a8a9a',
  fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
};
