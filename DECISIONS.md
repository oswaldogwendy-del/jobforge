# Decisions

Calls made where the PRD is silent or where reality differed from it (PRD Section 0, rule 6). Newest milestone first.

## M2

1. **Phone feedback on M1** (FPS "okay", controls "okay", animation "a bit clunky but acceptable", the hero dies after about ten enemies because regen is slow). You chose no balance change for survival: potions, gear and levels in M2 are the answer. Animation polish stays in M5. The simulator (`npm run sim -- --progress`) shows what a plain bot does with them.
2. **Knockback** is now a 0.25 s ease-out slide that obstacles stop, not an instant jump. A skill push also makes a normal monster flinch for 0.35 s and drops its windup. Elites move 60% as far and keep acting, and a charger mid-dash finishes the dash. Bosses stay immune. A pushed target ignores further pushes for 1.2 s, so a basic attack every 0.6 s cannot pin an enemy away from you. Basic attacks nudge by weapon (sword 0.6 m, greataxe 1 m, mace 0.8, dagger 0.3, staff, bow and gun 0.3) without a flinch. Crushing Blow (2 m), Crescent Sweep (1.5 m) and Cataclysm (1.5 m) now push, next to Flame Burst, Bulwark Charge and Wall of Flame. A push can make a melee monster miss, because its hit lands where you were. Constants are in `balance.json` under `combat.knockback`.
3. **Starting kit.** A new hero is level 1 with 48 stat points spent by template (or by hand), a Worn Sword or Staff, light armor, 200 gold (enough for two tier-1 skills), five Minor Health and five Minor Mana Draughts, and no skills. The PRD does not say; this gets the first fight and first Guild Hall visit going.
4. **Level-up heals fully** and the stat and skill points arrive at once. Points are spent in town (Status window), not mid-run.
5. **Staves are one-handed**, so a Mage can carry a tome. Greataxes and bows are two-handed and empty the off-hand; equipping one sends the off-hand to the bag.
6. **Slot unlocks follow the PRD** (4 active, 2 passive at the start; 5th active after Boss 1, 6th after Boss 2; 3rd and 4th passive after Bosses 3 and 4; presets 2 and 3 after Bosses 5 and 6). Only Boss 1 exists in M2, so a new hero has 4 active slots and the skill bar shows two locked buttons. Preset tabs 2 and 3 are shown locked.
7. **All 12 trainers appear in the Guild Hall.** Archer, Priest, Thief, Merchant and the advanced six are greyed with "Coming in M3 or M4" (`comingIn` in `classes.json`). The advanced six name their boss unlock; the Abbot and Scarab Rex do not exist yet.
8. **Items.** `tools/gen-items.mjs` builds `items.json` (140 items: 6 tiers of 8 weapon types, shield, tome, helm, hat, three armors, cloak, boots and six rings) from the Section 12 numbers. Rarity scales ATK, MATK, DEF and MDEF only; Rare and Epic bonus stats are +1 times the item tier on random distinct stats. Card slots are rolled but unusable until M3. Sell price is `12 x 2.2^(tier-1) x type weight`, times 1.6 (Fine), 3.5 (Rare), 9 (Epic) or 15 (Legendary).
9. **Legendaries.** The Royal Jelly Crown's heal-on-kill (2% Max HP) works. The Wobbling Scepter has its stats, but the 10% double cast is not built (the text says it arrives in M3). Head items are not drawn on the hero. A Knuckle shows the sword model, and a Mace the one-handed axe, until their classes arrive.
10. **Drops fly to the hero 0.5 s after the kill** and are collected on arrival, at any distance. A full bag sends items to the Overflow box (50), which you claim from Inventory. The bag counts items that are not equipped. Gold and EXP are applied on each kill, so a death keeps everything.
11. **Consumables.** Two potion slots on the HUD, chosen in Loadout. Health draughts share an 8 s cooldown and so do mana draughts. Panacea can be slotted. The Phoenix Feather and Field Manual are listed in `stacks.json` but nothing drops or uses them yet (Tower, M3).
12. **Boss Sigil** opens Queen Gelatina from the World Map for one Sigil (elite drops, 25%). The portal route is unchanged.
13. **Saves.** Three IndexedDB slots (`idb-keyval`), autosave 0.7 s after a change, on level-up, boss kill, leaving a zone and every 60 s in town. If IndexedDB fails the game keeps working from memory and the title screen warns. Export is `JF1:` plus zlib-compressed JSON in base64 and a checksum. Settings live in `localStorage` for the whole device and are copied into each save.
14. **Menu icons are drawn tiles** (a coloured square with two letters, a rarity border), because the repo has no icon art. Real icons are an M5 job.
15. **Settings subset:** damage numbers (on, compact, off), FPS counter, auto-sell Common, and Export and Import. UI scale, left-handed mode, graphics presets and volumes are M5. The FPS counter is on by default during testing.
16. **Update toast shows in menus only,** never during a run, a chest or results.
17. **The fixture hero (`devHero.json`) stays** for tests and the bot (level 12, tier-2 gear), but the game no longer reads it. The old dev Loadout panel is gone.
18. **Progress bot policy** (`tools/sim/progress.ts`): spends points by template weights, learns skills in a fixed order, equips the best item per slot, sells the rest, keeps eight potions of each kind when gold allows, drinks a health draught below 40% HP and walks 30 s back to town after a death.

## M1

1. **Monster models.** Zone 1 uses the Quaternius Ultimate Monsters you uploaded: Jellop = GreenBlob, Capshroom = Mushnub, Thornling = GreenSpikyBlob, Rootmole = Dog (brown tint), Hopbun = Bunny, Buzzwing = Armabee, Thorn Guardian = Cactoro, Queen Gelatina = PinkBlob scaled up with a gold crown built in code. Only the eight models in use ship (about 1.1 MB). The training dummy is still built in code, and summons use a capsule until a skeleton model is added.
2. **Schema extensions** beyond the PRD's `EffectDef`, needed by the 16 Knight and Mage skills: `atRank` (Crushing Blow's stun only at rank 5), `bonusIfStatus` (Crescent Sweep +30% vs stunned), `chain` (Chain Lightning jumps), `scatter` (Cataclysm meteors), `dash.onPass` (Bulwark Charge hits along its path), and `immune` and `key` on buffs. Buff stats beyond the PRD list: `basicBonusAtk`, `basicFireBonus`, `spCostPct`, `damageReduction`.
3. **Crits skip the hit and perfect-dodge rolls.** The PRD says crits always hit, so a crit also cannot be dodged. Magic never misses.
4. **Melee skills start from step distance plus reach.** A melee skill (4 m range in the data) can be used on a target up to 4 m plus the weapon's reach away; the hero steps in first.
5. **Wall of Flame** is centred on the aimed point and perpendicular to the cast direction, and knocks enemies away from the caster. A boss ignores knockback.
6. **Dev hero.** Level 12 with 90 stat points and 11 skill points all spent, wearing tier-2 gear (the PRD's on-level gear for level 12). All 6 active and 4 passive slots are open, because slot unlocks need saves (M2). The build is kept in `localStorage` (`jobforge.devbuild.v1`) and checked against the rules when loaded.
7. **Dev loadout panel** stands in for the Status window, Guild Hall and Loadout screens until M2. It runs the real rules: stat point costs, requirements, tier prerequisites, rank-ups from skill points, and dormant skills.
8. **Dormant skills are unusable in the engine,** not only hidden in the UI: slots are rebuilt from the build and any skill whose requirement fails is dropped. Requirements count base stats only; passives and buffs never count (PRD Section 7).
9. **Queen tuning.** HP x50 (PRD says x70), ATK x1.75, cooldowns 7.5 s (slam), 8 s (spit) and 11 s (roll). The attack numbers in the data (180% slam, 190% roll) are unchanged; the multiplier brings a heavy hit into the PRD's 25 to 35% band for the Knight preset. The telegraph warnings are the PRD's: 1.2 s slam, 1.0 s roll. HP and cadence were tuned with the bot and should be rechecked by the M3 and M4 simulator gates.
10. **Boss scripts.** Attack data carries `script: "leap"` (she jumps onto the hero's spot) and `script: "roll"` (she rolls along the line). The Jellop split is a small script for her alone.
11. **Archetypes implemented now:** dummy, chaser, kiter, caster, charger and burrower. Swarmer, exploder and splitter act as chasers and support acts as a kiter until M3.
12. **Run totals are not persisted.** Gold and EXP are computed with the PRD formulas and shown on the results screen; saving, levelling and the chest's items come in M2.
13. **Town is a stub:** the hero idling in front of a menu (Adventure, Loadout, Training Yard). The M0 arena is kept as the Training Yard for testing skills.
14. **Telegraph cues.** One shader draws every shape. Damage is red with diagonal stripes, debuffs are purple with dots, freeze is blue with a grid, so colour is never the only cue.
15. **Monsters never stack:** a soft push from neighbours plus a hard overlap correction. The leash (30 m) is checked before anything else, even mid-attack.
16. **Tuning bot.** `tools/sim` uses `tsx` to run the TypeScript sim from Node. The bot is deliberately simple and is not a stand-in for a good player.

## M0

1. **Preact for the HUD shell, plain DOM for skill buttons.** The debug panel and toasts are Preact. The six skill buttons update their cooldown sweep every frame, so they are plain DOM to avoid re-rendering.
2. **A small fixed-tick sim exists already.** `src/sim/` holds hero, dummies, targeting and a placeholder damage roll, ticking at 30 Hz with render interpolation. It is pure (an ESLint rule bans three.js, Preact and DOM imports there). M1 replaces the placeholders with the Section 6 and 10 formulas.
3. **`debugSkills.json` is a placeholder.** Six area skills (cone, circle, line, ground circle) with cooldowns only, so the buttons and the drag-to-aim work. There is no SP in M0. M1 replaces this file with the real skill schema.
4. **Potion buttons are deferred** to M1 and M2. M0 only has the six skill buttons.
5. **Blob shadows only.** The High preset's 1024 shadow map and the Auto preset are M5. Pixel ratio is capped at 2, and antialiasing is on only when the device pixel ratio is below 2.
6. **Lambert materials.** glTF PBR materials are converted to `MeshLambertMaterial` on load (PRD Section 15 shading).
7. **Models ship mesh-only, with one shared clip file.** All 5 characters share an identical 41-bone rig and carry the same 76 animations. Shipping the clips five times cost 12 MB, so `character_anims.glb` holds them once and the five characters are about 110 KB each (3 MB of models in total). The weapons and off-hands baked into each character are removed, and `sword_1handed.glb` and the like are attached to `handslot.r` and `handslot.l` at load time.
8. **The standalone KayKit Character Animations pack is not in the repo.** M0 asks to confirm its rig matches the Adventurers rig. I could only confirm that the Adventurers characters match each other and that their 76 bundled clips cover M0 (see `tests/rig.test.ts` and `public/assets/models/rig-report.json`). If the standalone pack is added to `assets-src/`, its rig must be checked the same way before relying on it.
9. **Joystick is for touch and pen only.** A mouse never spawns a joystick. A mouse click or a quick touch tap (up to 250 ms and 10 px of movement) focuses an enemy, and tapping it again or empty ground clears the focus.
10. **Rotate screen applies to any portrait viewport,** including a tall desktop window, and the game pauses behind it.
11. **Update toast outside a town.** There is no town yet, so "Update ready, tap to restart" shows whenever a new service worker is waiting. It moves to town-only when town exists (M2). A short "Ready to play offline" toast also shows once the precache finishes, which helps phone testing.
12. **Debug button is always visible in M0** (top right, showing the live FPS). It becomes a setting later.
13. **Fredoka is bundled locally** through `@fontsource/fredoka` (SIL OFL), so offline play keeps the font.
14. **Tooling versions are the latest at install time** (Vite 8, TypeScript 6, Preact 11, vite-plugin-pwa 2, zod 4, ESLint 10, Vitest 5). The lockfile pins them.
15. **Pages deploys run lint and tests first,** so a broken build never publishes.
