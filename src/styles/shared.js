export const glass = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
};

export const glassLight = {
  background: "rgba(255,255,255,0.5)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.6)",
};

export const btnPrimary = {
  background: "#1a1a2e",
  color: "#fff",
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 0.15s, opacity 0.15s",
};

// Back button: subtle circle (glass background + thin border), enlarged
// chevron inside. Footprint stays at 42x42 so existing
// `<div style={{width:42}}/>` spacers keep the title visually centered
// across every page that uses topBar — but visually it's now bigger,
// more clickable, and reads as a tappable affordance instead of a faint
// hint.
export const btnBack = {
  background: "rgba(255,255,255,0.7)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(0,0,0,0.06)",
  padding: 0,
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 26,
  fontWeight: 400,
  color: "#1a1a2e",
  lineHeight: 1,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

export const pageWrapper = {
  minHeight: "100vh",
  // top padding = высота fixed-шапки (см. topBar ниже) + safe-area, чтобы
  // контент не подлезал под неё. base 12 + контент 42 (кнопка) + base 12 +
  // 16 запас «как был marginBottom у sticky» = 82.
  padding: "calc(env(safe-area-inset-top, 0px) + 82px) 20px 32px",
  position: "relative",
  zIndex: 1,
};

// Top bar: ЖЁСТКО прибит к верху viewport (position: fixed). Sticky-
// вариант ломался из-за сочетания ancestor overflow + браузерных
// scrollIntoView при фокусе на инпутах/редакторе TipTap (шапка
// «уезжала» при клике в поле). Fixed работает безусловно — не зависит
// от containing block и scroll-контекста. Привязан к 430px фрейму
// Layout'а через left:50% + translateX(-50%) + max-width.
export const topBar = {
  position: "fixed",
  // --vv-top реактивно выставляется в Layout по visualViewport.offsetTop —
  // на iOS Safari это компенсирует «уезжание» fixed-элемента при открытой
  // виртуальной клавиатуре. На Android/desktop это 0.
  top: "var(--vv-top, 0px)",
  left: "50%",
  transform: "translateX(-50%)",
  width: "100%",
  maxWidth: 430,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
  paddingBottom: 12,
  paddingLeft: 20,
  paddingRight: 20,
  background: "rgba(255,255,255,0.78)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid rgba(0,0,0,0.04)",
};

export const topBarTitle = {
  flex: 1,
  textAlign: "center",
  fontSize: 20,
  fontWeight: 700,
  color: "#1a1a2e",
  margin: 0,
};
