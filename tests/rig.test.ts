import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelMap } from '../src/data/schema';

// M0 checklist: "the Character Animations rig confirmed". These tests read the shipped .glb files
// and prove every look shares one rig, and that the clips the game uses exist.
const dir = join(__dirname, '..', 'public', 'assets', 'models');

function gltfJson(file: string) {
  const b = readFileSync(join(dir, file));
  expect(b.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as {
    nodes: { name?: string }[];
    skins?: { joints: number[] }[];
    animations?: { name: string }[];
  };
}
const bones = (file: string) => {
  const j = gltfJson(file);
  return j.skins![0].joints.map((i) => j.nodes[i].name);
};

describe('KayKit rig', () => {
  const looks = Object.values(modelMap.looks).map((l) => l.file);
  it('ships every hero look from modelMap.json', () => {
    const files = readdirSync(dir);
    for (const f of looks) expect(files).toContain(f);
  });
  it('every look has the identical 41-bone skeleton', () => {
    const ref = bones(looks[0]);
    expect(ref).toHaveLength(41);
    for (const f of looks) expect(bones(f)).toEqual(ref);
  });
  it('has the weapon attach bones', () => {
    const b = bones(looks[0]);
    for (const w of Object.values(modelMap.weapons)) expect(b).toContain(w.slot);
  });
  it('the shared clip file targets the same bones and contains the clips the game plays', () => {
    const anims = gltfJson(modelMap.animations.file);
    const names = anims.animations!.map((a) => a.name);
    expect(names).toContain(modelMap.animations.idle);
    expect(names).toContain(modelMap.animations.run);
    expect(names).toContain(modelMap.animations.attack);
    expect(names.length).toBe(76);
    const ref = new Set(bones(looks[0]));
    const nodeNames = new Set(anims.nodes.map((n) => n.name));
    for (const b of ref) expect(nodeNames.has(b)).toBe(true);
  });
  it('the pipeline report says every character matched', () => {
    const rep = JSON.parse(readFileSync(join(dir, 'rig-report.json'), 'utf8'));
    expect(Object.keys(rep.characters)).toHaveLength(5);
    expect(rep.sharedRig.bones).toHaveLength(41);
  });
});
