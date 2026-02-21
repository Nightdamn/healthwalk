import React from 'react';

export const WarmupIcon = ({ size = 36 }) => (
  <img src="/icons/warmup.svg" alt="Разминка" width={size} height={size} style={{ objectFit: "contain" }} />
);

export const StandingIcon = ({ size = 36 }) => (
  <img src="/icons/standing.svg" alt="Стояние" width={size} height={size} style={{ objectFit: "contain" }} />
);

export const SittingIcon = ({ size = 36 }) => (
  <img src="/icons/sitting.svg" alt="Сидение" width={size} height={size} style={{ objectFit: "contain" }} />
);

export const WalkingIcon = ({ size = 36 }) => (
  <img src="/icons/walking.svg" alt="Прогулка" width={size} height={size} style={{ objectFit: "contain" }} />
);

export const LogoFull = ({ height = 48 }) => (
  <img
    src="/icons/logo.svg"
    alt="Осознанная Походка"
    height={height}
    style={{ objectFit: "contain" }}
  />
);

export const Logo = ({ size = 40 }) => (
  <img
    src="/icons/logo.svg"
    alt="Осознанная Походка"
    height={size}
    style={{ objectFit: "contain" }}
  />
);

export const activityIcons = {
  warmup: WarmupIcon,
  standing: StandingIcon,
  sitting: SittingIcon,
  walking: WalkingIcon,
};
