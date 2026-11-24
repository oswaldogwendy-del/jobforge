// Converts the original KayKit downloads in assets-src/ into compressed .glb files in
// public/assets/models/ (PRD Section 15 pipeline). Run with: npm run assets
//
// - Extracts the zip into assets-src/_extracted (gitignored).
// - Converts characters and weapons to .glb with meshopt compression.
// - Asserts that every character shares one rig (same bones, same animation names).
// - Writes rig-report.json next to the models so the report is visible in review.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { unzipSync } from 'fflate';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ZIP = join(ROOT, 'assets-src', 'KayKit-Character-Pack-Adventures-1.0.zip');
const EXTRACT = join(ROOT, 'assets-src', '_extracted');
const OUT = join(ROOT, 'public', 'assets', 'models');

// Everything the game can show on a hero in v1 (Section 12 weapon and off-hand types).
const WEAPONS = [
  'sword_1handed',
  'sword_2handed',
  'axe_1handed',
  'axe_2handed',
  'dagger',
  'staff',
  'wand',
  'crossbow_1handed',
  'crossbow_2handed',
  'shield_round',
  'shield_square',
  'spellbook_closed',
];

if (!existsSync(ZIP)) throw new Error(`Missing ${ZIP}`);
rmSync(EXTRACT, { recursive: true, force: true });
mkdirSync(EXTRACT, { recursive: true });
const files = unzipSync(new Uint8Array(readFileSync(ZIP)));
for (const [name, data] of Object.entries(files)) {
  if (name.endsWith('/')) continue;
  const dest = join(EXTRACT, name);
  mkdirSync(join(dest, '..'), { recursive: true });
  writeFileSync(dest, data);
}
const packRoot = join(
  EXTRACT,
  readdirSync(EXTRACT)[0],
  'addons',
  'kaykit_character_pack_adventures',
);
const charDir = join(packRoot, 'Characters', 'gltf');
const weaponDir = join(packRoot, 'Assets', 'gltf');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.glb')) rmSync(join(OUT, f));

async function convert(
  src,
  outName,
  { stripAnimations = false, stripMeshes = false, stripHandItems = false } = {},
) {
  const doc = await io.read(src);
  if (stripHandItems) {
    // Weapons and off-hands baked into the character are replaced at runtime by separate models.
    for (const n of doc.getRoot().listNodes()) {
      const parent = n.getParentNode();
      if (parent && parent.getName().startsWith('handslot')) n.dispose();
    }
  }
  if (stripAnimations) {
    const root = doc.getRoot();
    root.listAnimations().forEach((a) => {
      a.listChannels().forEach((c) => c.dispose());
      a.listSamplers().forEach((sm) => sm.dispose());
      a.dispose();
    });
  }
  if (stripMeshes)
    doc
      .getRoot()
      .listMeshes()
      .forEach((m) => m.dispose());
  await doc.transform(
    dedup(),
    prune(),
    resample(),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(join(OUT, outName), doc);
  return doc;
}

const report = { characters: {}, weapons: [] };
let reference = null;
for (const file of readdirSync(charDir).filter((f) => f.endsWith('.glb'))) {
  const id = basename(file, '.glb');
  // Characters ship mesh-only: the clips are identical on every rig, so they are stored once
  // in character_anims.glb (PRD Section 15: share the animation clips).
  const full = await io.read(join(charDir, file));
  const doc = full;
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const bones = skin.listJoints().map((j) => j.getName());
  const anims = root.listAnimations().map((a) => a.getName());
  const rig = { bones, anims };
  if (!reference) reference = { id, ...rig };
  else {
    const sameBones = JSON.stringify(bones) === JSON.stringify(reference.bones);
    const sameAnims = JSON.stringify(anims) === JSON.stringify(reference.anims);
    if (!sameBones || !sameAnims) {
      throw new Error(
        `Rig mismatch: ${id} differs from ${reference.id} (bones ${sameBones}, anims ${sameAnims})`,
      );
    }
  }
  report.characters[id] = { bones: bones.length, animations: anims.length };
  await convert(join(charDir, file), `${id}.glb`, { stripAnimations: true, stripHandItems: true });
  if (id === 'Knight')
    await convert(join(charDir, file), 'character_anims.glb', { stripMeshes: true });
}
report.sharedRig = { bones: reference.bones, animations: reference.anims };

for (const w of WEAPONS) {
  await convert(join(weaponDir, `${w}.gltf`), `${w}.glb`);
  report.weapons.push(w);
}

let total = 0;
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.glb'))) {
  const size = statSync(join(OUT, f)).size;
  total += size;
  console.log(`${f.padEnd(24)} ${(size / 1024).toFixed(0).padStart(6)} KB`);
}
report.totalKB = Math.round(total / 1024);
writeFileSync(join(OUT, 'rig-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  `Total ${(total / 1024 / 1024).toFixed(2)} MB. Rig check passed for ${Object.keys(report.characters).length} characters.`,
);
