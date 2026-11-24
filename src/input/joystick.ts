export interface JoystickCfg {
  deadZone: number;
  maxRadiusPx: number;
  /** Tilt (0..1) at which the hero already runs at full speed. */
  fullSpeedAt: number;
}

/**
 * Turns a thumb offset in screen pixels into a move vector with magnitude 0..1.
 * PRD Section 5: dead zone 8%, maximum radius 60 CSS px, analog speed with half tilt or more
 * giving full speed. Screen up is north, which is -z in world space.
 */
export function joystickVector(
  dxPx: number,
  dyPx: number,
  cfg: JoystickCfg,
): { x: number; z: number } {
  const len = Math.hypot(dxPx, dyPx);
  if (len < 1e-6) return { x: 0, z: 0 };
  const tilt = Math.min(len / cfg.maxRadiusPx, 1);
  if (tilt < cfg.deadZone) return { x: 0, z: 0 };
  const scaled = (tilt - cfg.deadZone) / (cfg.fullSpeedAt - cfg.deadZone);
  const mag = Math.min(1, Math.max(0, scaled));
  return { x: (dxPx / len) * mag, z: (dyPx / len) * mag };
}

/** Clamps the knob to the stick radius, for drawing. */
export function clampKnob(
  dxPx: number,
  dyPx: number,
  maxRadiusPx: number,
): { x: number; y: number } {
  const len = Math.hypot(dxPx, dyPx);
  if (len <= maxRadiusPx) return { x: dxPx, y: dyPx };
  return { x: (dxPx / len) * maxRadiusPx, y: (dyPx / len) * maxRadiusPx };
}
