// Generates src/data/items.json from the PRD Section 12 templates. Run: node tools/gen-items.mjs
// The two Queen Gelatina legendaries are written by hand at the bottom.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const balance = JSON.parse(readFileSync(`${root}src/data/balance.json`, 'utf8'));
const weaponAtk = balance.items.weaponAtk;
const armorDef = balance.items.armorDef;
const PREFIX = ['Worn', 'Bonecarved', 'Sunsteel', 'Frostforged', 'Emberforged', 'Voidforged'];
const LEVEL = [1, 12, 25, 40, 55, 70];
const round = (n) => Math.round(n * 100) / 100;

const items = [];
const add = (it) => items.push(it);

// Sell price of a Common item. Rarity multiplies it (balance.items.sellRarityMult).
const price = (tier, weight) => Math.round(12 * Math.pow(2.2, tier - 1) * weight);

const WEAPONS = [
  // type, label, model, twoHanded
  ['sword', 'Sword', 'sword', false],
  ['greataxe', 'Greataxe', 'greataxe', true],
  ['dagger', 'Dagger', 'dagger', false],
  ['mace', 'Mace', 'mace', false],
  ['knuckle', 'Knuckle', 'knuckle', false],
  ['staff', 'Staff', 'staff', false],
  ['bow', 'Bow', 'bow', true],
  ['gun', 'Gun', 'gun', false],
];
const RINGS = [
  ['STR', 'Strength'],
  ['AGI', 'Agility'],
  ['VIT', 'Vitality'],
  ['INT', 'Intellect'],
  ['DEX', 'Dexterity'],
  ['LUK', 'Fortune'],
];

for (let t = 1; t <= 6; t++) {
  const i = t - 1;
  const p = PREFIX[i];
  const base = { tier: t, levelReq: LEVEL[i] };
  for (const [type, label, model, two] of WEAPONS) {
    const w = balance.weapons[type];
    const b = {};
    if (type === 'staff') {
      b.matk = round(weaponAtk[i] * balance.items.staffMatkMult);
      b.atk = round(weaponAtk[i] * balance.items.staffAtkFrac);
    } else {
      b.atk = round(weaponAtk[i] * w.atkMult);
      if (type === 'mace') b.matk = round(b.atk * balance.items.maceMatkFrac);
    }
    add({
      id: `${type}_t${t}`,
      name: `${p} ${label}`,
      slot: 'weapon',
      type,
      weaponType: type,
      twoHanded: two,
      ...base,
      base: b,
      aps: w.aps,
      range: w.range,
      maxSlots: 4,
      model,
      sellPrice: price(t, 2),
    });
  }
  add({
    id: `shield_t${t}`,
    name: `${p} Shield`,
    slot: 'offhand',
    type: 'shield',
    offhandType: 'shield',
    ...base,
    base: { def: round(armorDef[i] * 0.6) },
    maxSlots: 2,
    model: 'shield_round',
    sellPrice: price(t, 1.2),
  });
  add({
    id: `tome_t${t}`,
    name: `${p} Tome`,
    slot: 'offhand',
    type: 'tome',
    offhandType: 'tome',
    ...base,
    base: { matk: round(weaponAtk[i] * 0.4), maxSpPct: 0.04 * t },
    maxSlots: 2,
    model: 'spellbook_closed',
    sellPrice: price(t, 1.2),
  });
  add({
    id: `helm_t${t}`,
    name: `${p} Helm`,
    slot: 'head',
    type: 'helm',
    ...base,
    base: { def: round(armorDef[i] * 0.5) },
    maxSlots: 1,
    sellPrice: price(t, 0.8),
  });
  add({
    id: `hat_t${t}`,
    name: `${p} Hat`,
    slot: 'head',
    type: 'hat',
    ...base,
    base: { mdef: round(armorDef[i] * 0.5), def: round(armorDef[i] * 0.25) },
    maxSlots: 1,
    sellPrice: price(t, 0.8),
  });
  add({
    id: `plate_t${t}`,
    name: `${p} Plate`,
    slot: 'armor',
    type: 'plate',
    ...base,
    base: { def: armorDef[i] },
    maxSlots: 2,
    sellPrice: price(t, 1.5),
  });
  add({
    id: `leather_t${t}`,
    name: `${p} Leather`,
    slot: 'armor',
    type: 'leather',
    ...base,
    base: { def: round(armorDef[i] * 0.7), flee: 2 * t },
    maxSlots: 2,
    sellPrice: price(t, 1.5),
  });
  add({
    id: `robe_t${t}`,
    name: `${p} Robe`,
    slot: 'armor',
    type: 'robe',
    ...base,
    base: { def: round(armorDef[i] * 0.4), mdef: round(armorDef[i] * 0.6), maxSpPct: 0.03 * t },
    maxSlots: 2,
    sellPrice: price(t, 1.5),
  });
  add({
    id: `cloak_t${t}`,
    name: `${p} Cloak`,
    slot: 'garment',
    type: 'cloak',
    ...base,
    base: { def: round(armorDef[i] * 0.4), mdef: round(armorDef[i] * 0.4) },
    maxSlots: 1,
    sellPrice: price(t, 0.8),
  });
  add({
    id: `boots_t${t}`,
    name: `${p} Boots`,
    slot: 'shoes',
    type: 'boots',
    ...base,
    base: { def: round(armorDef[i] * 0.4), moveSpeedPct: 0.01 * t },
    maxSlots: 1,
    sellPrice: price(t, 0.8),
  });
  for (const [stat, label] of RINGS) {
    add({
      id: `ring_${stat.toLowerCase()}_t${t}`,
      name: `${p} Ring of ${label}`,
      slot: 'accessory',
      type: 'ring',
      ...base,
      base: { stats: { [stat]: t } },
      maxSlots: 1,
      sellPrice: price(t, 1),
    });
  }
}

// Queen Gelatina's two legendaries (PRD Section 11). Fixed stats, unique effect.
add({
  id: 'royal_jelly_crown',
  name: 'Royal Jelly Crown',
  slot: 'head',
  type: 'hat',
  tier: 1,
  levelReq: 10,
  base: { maxHpPct: 0.05, stats: { VIT: 2 }, def: 4, mdef: 4 },
  maxSlots: 0,
  sellPrice: 400,
  legendary: {
    text: 'Heal 2% Max HP for every kill.',
    healOnKillPct: 0.02,
  },
});
add({
  id: 'wobbling_scepter',
  name: 'Wobbling Scepter',
  slot: 'weapon',
  type: 'staff',
  weaponType: 'staff',
  twoHanded: true,
  tier: 1,
  levelReq: 10,
  base: { matk: 20, atk: 6 },
  aps: balance.weapons.staff.aps,
  range: balance.weapons.staff.range,
  maxSlots: 0,
  model: 'staff',
  sellPrice: 400,
  legendary: {
    text: 'Spells have a 10% chance to cast twice at 50% power. (The echo arrives in M3.)',
    spellEchoChance: 0.1,
  },
});

writeFileSync(`${root}src/data/items.json`, JSON.stringify(items, null, 2) + '\n');
console.log(`Wrote ${items.length} items.`);
