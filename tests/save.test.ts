import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportCode, importCode } from '../src/save/code';
import { migrations, parseSave, SaveError } from '../src/save/schema';
import { deleteSlot, listSlots, loadSlot, saveSlot, storageDegraded } from '../src/save/storage';
import { SAVE_VERSION } from '../src/save/types';
import { buildOf, newSave } from '../src/sim/profile';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(fixtureDir).filter((f) => /^save\.v\d+\.json$/.test(f));

describe('save versions and migrations', () => {
  it('has a fixture for every past version, and a migration chain up to the current one', () => {
    for (let v = 1; v <= SAVE_VERSION; v++) expect(fixtures).toContain(`save.v${v}.json`);
    for (let v = 1; v < SAVE_VERSION; v++) expect(typeof migrations[v]).toBe('function');
  });

  it.each(fixtures)('loads %s into the current version', (file) => {
    const raw = JSON.parse(readFileSync(new URL(file, fixtureDir), 'utf8'));
    const s = parseSave(raw);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.hero.name).toBe('Fixture');
    expect(s.hero.learned.knight_crushing_blow).toBeGreaterThanOrEqual(1);
    expect(s.hero.inventory.some((i) => i.uid === 'fixture-helm')).toBe(true);
    // The loaded hero builds into a valid sim build.
    const build = buildOf(s);
    expect(build.level).toBe(s.hero.level);
    expect(build.weapon.type).toBe('sword');
  });

  it('rejects unknown versions and damaged data with a readable error', () => {
    expect(() => parseSave({ version: 99 })).toThrow(SaveError);
    expect(() => parseSave(null)).toThrow(SaveError);
    const raw = JSON.parse(readFileSync(new URL('save.v1.json', fixtureDir), 'utf8'));
    raw.hero.level = 0;
    expect(() => parseSave(raw)).toThrow(/hero\.level/);
  });

  it('fills settings added in later versions with defaults', () => {
    const raw = JSON.parse(readFileSync(new URL('save.v1.json', fixtureDir), 'utf8'));
    delete raw.settings.leftHanded;
    expect(parseSave(raw).settings.leftHanded).toBe(false);
  });
});

describe('export and import', () => {
  const s = newSave({ name: 'Round Trip', look: 'mage', weapon: 'staff', template: 'caster' });

  it('round-trips a save through a text code', () => {
    const code = exportCode(s);
    expect(code.startsWith('JF1:')).toBe(true);
    expect(code).not.toMatch(/\s/);
    expect(importCode(code)).toEqual(parseSave(JSON.parse(JSON.stringify(s))));
  });

  it('tolerates whitespace from copy and paste', () => {
    const code = exportCode(s);
    expect(importCode(`  ${code.slice(0, 40)}\n${code.slice(40)} \n`).hero.name).toBe('Round Trip');
  });

  it('rejects a truncated, edited or foreign code', () => {
    const code = exportCode(s);
    expect(() => importCode(code.slice(0, code.length - 30))).toThrow(SaveError);
    expect(() => importCode(code.replace('JF1:', 'XX1:'))).toThrow(/not a Jobforge/);
    expect(() => importCode(code.slice(0, 20) + 'A' + code.slice(21))).toThrow(SaveError);
    expect(() => importCode('')).toThrow(SaveError);
  });
});

describe('slot storage', () => {
  it('saves, lists, loads and deletes slots, falling back to memory without IndexedDB', async () => {
    const s = newSave({ name: 'Slotty', look: 'rogue', weapon: 'sword', template: 'rogue' });
    await saveSlot(1, s);
    expect(storageDegraded()).toBe(true); // Node has no IndexedDB
    const loaded = await loadSlot(1);
    expect(loaded?.hero.name).toBe('Slotty');
    const list = await listSlots();
    expect(list.map((x) => x.save?.hero.name ?? null)).toEqual([null, 'Slotty', null]);
    await deleteSlot(1);
    expect(await loadSlot(1)).toBeNull();
  });
});
