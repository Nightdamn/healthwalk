import React from 'react';
import { LogoFull } from './Icons';

export default function Footer() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 0 44px",
        opacity: 0.7,
      }}
    >
      <LogoFull height={42} />
    </div>
  );
}
