import React, { useEffect } from 'react';

export default function Layout({ children }) {
  // iOS Safari: при фокусе на input/textarea/contenteditable открывается
  // виртуальная клавиатура — visual viewport сжимается, layout viewport
  // остаётся прежним. position:fixed top:0 прибит к layout viewport,
  // и при скролле шапка визуально «уезжает» за пределы visual viewport.
  // Реактивно подкручиваем top через CSS var --vv-top равный
  // visualViewport.offsetTop. На Android/desktop offsetTop = 0, поведение
  // не меняется.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('scroll', update);
    vv.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('scroll', update);
      vv.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: "'Onest', -apple-system, sans-serif",
        minHeight: "100vh",
        background: "linear-gradient(160deg, #fafbfc 0%, #f0f2f5 30%, #e8ecf1 60%, #f5f7fa 100%)",
        position: "relative",
        // overflow: 'hidden' ломал position:sticky на дочерней шапке.
        // Orbs ниже — position:fixed, привязаны к viewport, им клиппер
        // не нужен. overflowX:'clip' гасит горизонтальный leak без
        // сцепления sticky по вертикали.
        overflowX: "clip",
        maxWidth: 430,
        margin: "0 auto",
        boxShadow: "0 0 80px rgba(0,0,0,0.06)",
      }}
    >
      {/* Background orbs */}
      <div
        style={{
          position: "fixed",
          top: -120,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,220,240,0.3) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: -100,
          left: -60,
          width: 250,
          height: 250,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(220,230,210,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}
