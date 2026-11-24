import { describe, expect, it } from 'vitest';
import { balance, modelMap, parseBalance } from '../src/data/schema';
import { bosses, monsters, skills, zones } from '../src/data/content';
import balanceJson from '../src/data/balance.json';

describe('data files', () => {
  it('load and cross-reference (a bad reference throws and names the file)', () => {
    expect(balance.tickRate).toBe(30);
    expect(skills).toHaveLength(16);
    expect(monsters.length).toBeGreaterThan(5);
    expect(bosses[0].id).toBe('queen_gelatina');
    expect(zones[0].field.spawnPoints).toHaveLength(10);
    expect(modelMap.looks[modelMap.hero.look]).toBeDefined();
    expect(modelMap.weapons[modelMap.hero.weapon]).toBeDefined();
    for (const m of [...monsters, ...bosses])
      if (m.model !== 'dummy') expect(modelMap.monsters[m.model]).toBeDefined();
  });
  it('balance.json fails loudly and names the field for a bad value', () => {
    const bad = JSON.parse(JSON.stringify(balanceJson));
    bad.derived.hp.base = Number.NaN;
    expect(() => parseBalance('balance.json', bad)).toThrow(/balance\.json: derived\.hp\.base/);
    const out = JSON.parse(JSON.stringify(balanceJson));
    out.joystick.deadZone = 5;
    expect(() => parseBalance('balance.json', out)).toThrow(/joystick\.deadZone/);
    const str = JSON.parse(JSON.stringify(balanceJson));
    str.camera.fov = undefined;
    expect(() => parseBalance('balance.json', str)).toThrow(/camera\.fov/);
  });
  it('matches the PRD camera, joystick and caps', () => {
    expect(balance.camera).toMatchObject({ fov: 40, pitchDeg: 55, distance: 18, lookAhead: 2 });
    expect(balance.joystick).toMatchObject({ zoneFraction: 0.45, deadZone: 0.08, maxRadiusPx: 60 });
    expect(balance.derived.moveSpeedBase).toBe(5);
    expect(balance.caps).toMatchObject({
      cdrPct: 40,
      apsMax: 3,
      critChancePct: 80,
      perfectDodgePct: 30,
      statusResistPct: 75,
      totalReductionPct: 85,
    });
    expect(balance.combat.globalCooldown).toBe(0.4);
  });
});
