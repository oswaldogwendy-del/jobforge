import { describe, expect, it } from 'vitest';
import { buildFromPreset } from '../src/data/content';
import { SimWorld } from '../src/sim/world';
import { DT, still } from './helpers';

describe('smoke', () => {
  it('a field world boots, runs 20 s and has monsters', () => {
    const w = new SimWorld({ build: buildFromPreset('warrior'), seed: 7, mode: 'field' });
    for (let i = 0; i < 600; i++) w.tick(DT, still);
    expect(w.aliveEnemies()).toBeGreaterThan(10);
    expect(w.aliveEnemies()).toBeLessThanOrEqual(30);
    expect(w.hero.maxHp).toBeGreaterThan(100);
  });
  it('the yard boots with 30 dummies', () => {
    const w = new SimWorld({ build: buildFromPreset('caster'), seed: 7, mode: 'yard' });
    expect(w.aliveEnemies()).toBe(30);
  });
});
