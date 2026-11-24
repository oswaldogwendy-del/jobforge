import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { FixedStepper } from '../src/core/stepper';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds and stays in [0, 1)', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('FixedStepper', () => {
  it('runs one tick per 1/30 s and carries the remainder', () => {
    const s = new FixedStepper(30, 0.25);
    expect(s.advance(1 / 60)).toBe(0);
    expect(s.alpha).toBeCloseTo(0.5, 5);
    expect(s.advance(1 / 60)).toBe(1);
    expect(s.alpha).toBeCloseTo(0, 5);
    expect(s.advance(0.1)).toBe(3);
  });
  it('clamps long frames so a stalled tab does not spiral', () => {
    const s = new FixedStepper(30, 0.25);
    expect(s.advance(5)).toBe(7);
  });
  it('ignores negative time', () => {
    const s = new FixedStepper(30, 0.25);
    expect(s.advance(-1)).toBe(0);
  });
});
