import { describe, expect, it } from 'vitest';
import { balance } from '../src/data/schema';
import { clampKnob, joystickVector } from '../src/input/joystick';

const cfg = balance.joystick;

describe('joystickVector', () => {
  it('ignores movement inside the 8% dead zone', () => {
    expect(joystickVector(2, 2, cfg)).toEqual({ x: 0, z: 0 });
    expect(joystickVector(0, 0, cfg)).toEqual({ x: 0, z: 0 });
  });
  it('gives full speed at half tilt or more', () => {
    const half = joystickVector(cfg.maxRadiusPx * 0.5, 0, cfg);
    expect(half.x).toBeCloseTo(1, 6);
    const full = joystickVector(cfg.maxRadiusPx * 3, 0, cfg);
    expect(Math.hypot(full.x, full.z)).toBeCloseTo(1, 6);
  });
  it('is analog between the dead zone and half tilt', () => {
    const v = joystickVector(cfg.maxRadiusPx * 0.25, 0, cfg);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(1);
  });
  it('maps screen up to north (negative z) and keeps direction', () => {
    const v = joystickVector(0, -50, cfg);
    expect(v.z).toBeLessThan(0);
    expect(v.x).toBeCloseTo(0, 6);
    const d = joystickVector(30, 30, cfg);
    expect(d.x).toBeCloseTo(d.z, 6);
  });
});

describe('clampKnob', () => {
  it('clamps to the stick radius', () => {
    const k = clampKnob(300, 0, 60);
    expect(k.x).toBeCloseTo(60, 6);
    expect(clampKnob(10, 10, 60)).toEqual({ x: 10, y: 10 });
  });
});
