import React, { useState } from 'react';
import Layout from '../components/Layout';
import { LogoFull } from '../components/Icons';
import { supabase } from '../lib/supabase';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Введите email и пароль");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1),
            },
          },
        });
        if (signUpError) throw signUpError;

        // Supabase may require email confirmation
        if (data?.user?.identities?.length === 0) {
          setError("Пользователь с таким email уже существует");
        } else if (data?.session) {
          // Auto-confirmed, session available
          onLogin(data.session);
        } else {
          setMessage("Проверьте почту — мы отправили ссылку для подтверждения");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        if (data?.session) {
          onLogin(data.session);
        }
      }
    } catch (err) {
      const msg = err?.message || "Произошла ошибка";
      if (msg.includes("Invalid login")) {
        setError("Неверный email или пароль");
      } else if (msg.includes("Email not confirmed")) {
        setError("Подтвердите email — проверьте почту");
      } else if (msg.includes("already registered")) {
        setError("Пользователь уже зарегистрирован");
      } else if (msg.includes("least 6")) {
        setError("Пароль должен быть не менее 6 символов");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (googleError) throw googleError;
      // Browser will redirect to Google — no need to do anything else
    } catch (err) {
      setError(err?.message || "Ошибка входа через Google");
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    border: "1.5px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    fontSize: 15,
    background: "rgba(255,255,255,0.6)",
    color: "#1a1a2e",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  return (
    <Layout>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 28px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <LogoFull height={56} />
        </div>
        <p style={{ fontSize: 15, color: "#8a8a9a", margin: "0 0 40px", fontWeight: 400 }}>
          Сейчас самое время сделать первый шаг
        </p>

        <div
          style={{
            width: "100%",
            maxWidth: 340,
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderRadius: 20,
            padding: "28px 24px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.05)",
            border: "1px solid rgba(255,255,255,0.8)",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", marginBottom: 24, background: "rgba(0,0,0,0.03)", borderRadius: 12, padding: 3 }}>
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setMessage(""); }}
                style={{
                  flex: 1, padding: "10px 0", border: "none", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.25s ease",
                  background: mode === m ? "#fff" : "transparent",
                  color: mode === m ? "#1a1a2e" : "#8a8a9a",
                  boxShadow: mode === m ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          {/* Error / Success messages */}
          {error && (
            <div style={{
              padding: "10px 14px", marginBottom: 16, borderRadius: 10,
              background: "rgba(220,50,50,0.08)", color: "#c0392b",
              fontSize: 13, fontWeight: 500, lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{
              padding: "10px 14px", marginBottom: 16, borderRadius: 10,
              background: "rgba(39,174,96,0.08)", color: "#27ae60",
              fontSize: 13, fontWeight: 500, lineHeight: 1.4,
            }}>
              {message}
            </div>
          )}

          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={loading}
            style={{ ...inputStyle, marginBottom: 12, opacity: loading ? 0.6 : 1 }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.15)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.06)")}
          />
          <input
            type="password" placeholder="Пароль" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={loading}
            style={{ ...inputStyle, marginBottom: 20, opacity: loading ? 0.6 : 1 }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.15)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.06)")}
          />

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", padding: "15px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: 14, fontSize: 15, fontWeight: 600,
              cursor: loading ? "wait" : "pointer", marginBottom: 12,
              opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
            }}
          >
            {loading
              ? "Загрузка..."
              : mode === "login" ? "Войти" : "Зарегистрироваться"
            }
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
            <span style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>или</span>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: "100%", padding: "14px",
              background: "rgba(255,255,255,0.8)", color: "#333",
              border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 14,
              fontSize: 14, fontWeight: 500, cursor: loading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            Войти через Google
          </button>
        </div>
      </div>
    </Layout>
  );
}
