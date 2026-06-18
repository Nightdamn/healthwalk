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
  padding: "0 20px 32px",
  position: "relative",
  zIndex: 1,
};

// Compact top bar: 12px base + iOS safe-area (notch) on PWA. Used to be 52px
// flat which looked like wasted space on desktop and on devices without a
// notch.
export const topBar = {
  display: "flex",
  alignItems: "center",
  paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
  marginBottom: 16,
};

export const topBarTitle = {
  flex: 1,
  textAlign: "center",
  fontSize: 20,
  fontWeight: 700,
  color: "#1a1a2e",
  margin: 0,
};
