import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  DebugSkillSchema,
  balance,
  debugSkills,
  modelMap,
  parseOrThrow,
} from '../src/data/schema';

describe('data files', () => {
  it('parse against their schemas', () => {
    expect(balance.tickRate).toBe(30);
    expect(debugSkills).toHaveLength(6);
    expect(modelMap.looks[modelMap.hero.look]).toBeDefined();
    expect(modelMap.weapons[modelMap.hero.weapon]).toBeDefined();
  });
  it('a bad file fails loudly and names the file and field', () => {
    const bad = { ...balance, hero: { ...balance.hero, moveSpeed: -1 } };
    expect(() => parseOrThrow('balance.json', BalanceSchema, bad)).toThrow(
      /balance\.json: hero\.moveSpeed/,
    );
    expect(() => parseOrThrow('debugSkills.json', DebugSkillSchema, { id: 1 })).toThrow(
      /debugSkills\.json/,
    );
  });
  it('matches the PRD camera and joystick numbers', () => {
    expect(balance.camera).toMatchObject({ fov: 40, pitchDeg: 55, distance: 18, lookAhead: 2 });
    expect(balance.joystick).toMatchObject({ zoneFraction: 0.45, deadZone: 0.08, maxRadiusPx: 60 });
    expect(balance.hero.moveSpeed).toBe(5);
  });
});
