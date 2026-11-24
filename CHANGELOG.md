# Changelog

## M2: Progression and town (built, waiting on phone testing)

You make a hero, fight, level up, spend points, learn skills, equip drops and come back to a hub that saves everything. It also adds the knockback you asked for after testing M1.

### Checklist (PRD Section 17)

- [x] Base EXP and levels, stat points, and the Status window with preview and Unlocks list (`src/sim/profile.ts`, `src/ui/screens/Status.tsx`)
- [x] Guild Hall learning (trainer, requirement, tier prerequisite, gold), ranks and the free rank reset. All 12 trainers are listed; only Knight and Mage are open
- [x] Loadout screen with dormant skills, and the skill bar locked inside zones
- [x] Item drops, rarity, inventory, equipment, compare, shop and selling (140 items; card slots roll but cards arrive in M3)
- [x] Town hub, World Map and Oracle stat reset
- [x] Saves: 3 slots in IndexedDB, autosave, export and import, and the migration test (a fixture for version 1 and a loader chain for later versions)
- [ ] Levels 1 to 15 playable without debug tools. The bot gets there (see below), but it needs a human on a phone to confirm
- [ ] **Phone check** (needs your iPhone): the whole loop from Title to Create hero, a fight, level-up, Guild Hall, Loadout, a drop, selling, the boss and a reload that still shows your hero

Also in this build: knockback (a smooth slide with a flinch, a nudge on basic attacks, and pushes on Crushing Blow, Crescent Sweep and Cataclysm), two potion buttons, drops that fly to you under a rarity beam, a Boss Sigil route to the Queen from the World Map, and a Settings screen with damage numbers, FPS counter, auto-sell and save export.

### Test results

- `npm test`: 264 tests in 19 files pass (54 new): knockback, save versions and the migration chain, export and import round trip, slot storage, EXP and level curve, stat spending and the Oracle, learning, ranks and dormant skills, slot unlocks, bag, overflow, shop and selling, equip rules, rarity and drop rates (seeded, thousands of rolls), gear totals into the sim, kill rewards, pickups, the chest and potions.
- `npm run lint`, `tsc --noEmit` and `npm run build` are clean, also with `BASE_PATH=/jobforge/`. Download is about 5.4 MB against the 15 MB budget.
- Headless Chromium at 844x390 with touch emulation, from an empty browser: Title, Create hero, Town, every menu, a first fight with level-ups, drops and the potion button, the Queen through the portal and through a Sigil, the chest, a death that keeps loot, results, a reload that continues the same hero, an export and an import into a second slot, and an offline reload under `/jobforge/`: zero console errors. Screenshots were checked by eye.

### Simulator (`npm run sim -- --progress`, bot from level 1 in Meadowmere)

The bot spends points by template, learns skills in a fixed order, equips the best drops, sells the rest, drinks potions below 40% HP and loses 30 s per death. Two seeds each:

| Build            | Level 5        | Level 10     | Level 15     | Deaths by level 15 |
| ---------------- | -------------- | ------------ | ------------ | ------------------ |
| Caster (Mage)    | 3.1 to 3.3 min | 13 to 15 min | 33 min       | 3                  |
| Warrior (Knight) | 6 to 8 min     | 26 to 30 min | 57 to 67 min | 23 to 24           |

Both reach level 15 with no debug tools, at about 20 kills per minute. The PRD pace is level 1 to 30 in about 1.5 hours, so level 15 in about 30 minutes: the Caster is on it, the Knight bot is not, because it dies a lot (same weakness as M1, see Known issues).

### Known issues

- **Survival is unchanged.** You asked not to change it, and the bot still dies a lot as a Knight. Potions and gear help but I did not retune. Tell me after the phone test if this still feels wrong.
- No sound, and effects are basic (M5). Animation is "a bit clunky" (your words): blends and speed matching are M5.
- Menu icons are drawn tiles with two letters, not art. Head items are not shown on the hero. Knuckle uses the sword model and Mace the one-handed axe until those classes arrive.
- The Wobbling Scepter's double cast is not built (its stats work). The Royal Jelly Crown's heal-on-kill works.
- Cards, the Codex, the Blacksmith, refining and the Tower are not here (M3). The World Map shows Zones 2 to 6 locked.
- Settings is a subset (damage numbers, FPS counter, auto-sell, save code). UI scale, left-handed mode, graphics presets and volumes are M5. No auto-battle toggle yet (M3).
- A knockback can make a melee monster miss, because its hit lands where you stood. That is on purpose, and it makes basic-attack pushes a mild defence.
- iOS Safari deletes a site's storage after 7 days without a visit unless it is a Home Screen app. The title screen says so on iPhone. Use Export now and then. Real IndexedDB behaviour on iOS is not yet confirmed.
- Only the iPhone has been tested; an Android phone has not.

### How to test on your iPhone

1. Merge the PR to `main`. The Deploy workflow updates `https://oswaldogwendy-del.github.io/jobforge/`.
2. If you have the old version installed, close it, open it online and wait 10 seconds. Tap **Update ready, tap to restart** when it appears (it only shows in menus). If it never appears, delete the icon, clear `github.io` website data in Settings, and add it to the Home Screen again.
3. Tap **New hero**, pick a look and a template, and start. Go to **Guild Hall**, learn a skill with your 200 gold, press **Equip**, and check it in **Loadout**.
4. Tap **Adventure** and fight. Watch the FPS number, the potion buttons and the gems that fly to you. Level up, then spend points in **Status**.
5. Try **Inventory** (equip, compare, sell), **Shop**, **Oracle** and **World Map**. Use the DBG panel's **Level up** and **+10k gold** only if you want to skip ahead.
6. Close the app fully and reopen it: **Play** on your slot should show the same hero.
7. Tell me the FPS and anything that feels wrong: menus you cannot read or reach, button sizes, the knockback feel, and whether levelling 1 to 15 feels like too much grind.

## M1: Combat core (done, phone-tested)

A real fight. Town stub, then Meadowmere Fields with 10 spawn points of monster packs, an elite about every 150 s, a boss gauge and portal, then Queen Gelatina in her own arena, the victory chest, a results screen, and death returning to town with loot kept. The hero is a level-12 test hero (Knight or Mage preset) built from the real stat, damage and skill systems.

### Checklist (PRD Section 17)

- [x] Sim and render split, with a 30 Hz fixed tick and interpolation (`src/sim/` is pure; an ESLint rule keeps three.js, Preact and the DOM out of it)
- [x] Stats and formulas module, with a unit test for every formula in Section 6 (`tests/stats.test.ts`, including the 210/555/885/1,273 point totals and the 47/135/263/431/628 stat costs)
- [x] Skill engine with every primitive, and Knight and Mage (16 skills) running from JSON. Primitives no Knight or Mage skill uses (heal, shield, cleanse, summon, resource, toggle, lethal and proc triggers) are tested with fixture skills
- [x] Chaser, kiter, caster and charger monsters, telegraphs and status effects. Zone 1 also needed the burrower (Rootmole), so that is in too
- [x] Zone 1 field: spawner, packs, elite, boss gauge and portal
- [x] Queen Gelatina with every pattern and both splits, the victory chest and the results screen
- [x] Death returns the hero to town with loot kept
- [x] **Phone check** (iPhone, your report): "fps is okay", "overall control feels okay", "animation is a bit clunky but acceptable". The hero died after about ten enemies, which is why M2 adds potions, gear and knockback (DECISIONS.md, M2 item 1)

### Test results

- `npm test`: 210 tests in 15 files pass. New: stats, damage pipeline, statuses, casting rules, every skill and primitive, loadout rules, spatial hash and A*, monster AI, field and spawner, boss and run flow, data schemas, rig and monster clips.
- `npm run lint`, `tsc --noEmit` and `npm run build` are clean, also with `BASE_PATH=/jobforge/`. Download is about 5.3 MB (models 4.1 MB) against the 15 MB budget.
- Headless Chromium at 844x390 with touch emulation, driving the real game through town, field, telegraphs, portal, boss intro, boss fight and splits, chest, results, and death to town, plus the Mage preset, the loadout panel and an offline reload under the `/jobforge/` subpath: zero console errors.
- Render budget in that run: 22 to 27 draw calls (budget 120), 8k to 17k triangles (budget 200k), 27 to 28 skinned monsters (budget 40).

### Simulator (`npm run sim`, level-12 hero, tier-2 on-level gear)

A crude bot (it casts by skill priority, dodges telegraphs and projectiles, and has no potions) stands in for a player. A person on a phone will dodge better, so treat these as rough:

- **Field pace:** 19 to 27 kills per minute (PRD target 15 to 25). A pack of four kills a standing hero in about 4 s (target about 5 s), and a hero survives about 12 to 13 hits from same-level normals (target 12 to 15).
- **Survival:** the Mage bot lasts the full 5 minutes. The Knight bot usually dies within one minute against packs, because it fights in melee with no potions and only two skills at level 12.
- **Queen Gelatina:** the heavy hit is 29% of the Knight's Max HP and 39% of the Mage's, never over 50%. The bot beats her about half the time as Knight (about 190 to 200 s) and about one fight in three as Mage (about 70 to 75 s). The PRD target is 2 to 3 minutes. Real balance is the M3 and M4 simulator gates.

### Known issues

- The Knight is clearly weaker than the Mage in the field. Expect that to improve with items, potions and more skills in M2 to M4, but tell me if it feels wrong on the phone.
- The Queen's HP is x50 rather than the PRD's x70, and her ATK is x1.75, because the bot could not finish the fight otherwise. Revisit with the M3 gate (DECISIONS.md, item 9).
- Items, cards and her unique drops are not in yet, so the chest shows gold and EXP only. Gold and EXP are shown on the results screen but not saved (saves arrive in M2).
- No sound, and effects are basic: coloured flashes, glows and the telegraph shader. Per-skill effects and sounds are M5.
- Summons have no model yet (the KayKit skeleton pack is not in the repo), so they appear as bone-white capsules. No Knight or Mage skill summons anything.
- Archetypes beyond chaser, kiter, caster, charger and burrower (swarmer, exploder, support, splitter) fall back to chaser or kiter until M3.
- Only the iPhone has been tested for M0; an Android phone has not.

### How to test on your iPhone

1. Merge the PR to `main`. The Deploy workflow runs and updates `https://oswaldogwendy-del.github.io/jobforge/`.
2. If you have the old version installed, open it once online and tap **Update ready, tap to restart** when it appears.
3. Tap **Adventure**. Watch the FPS number at top right while 20 to 30 monsters chase you.
4. Fight with the joystick and the skill buttons. Try a drag-aim, and try Loadout (dev) in town to switch to the Caster preset or change stats.
5. Use the DBG panel, then **Fill gauge** to open the portal quickly, and fight Queen Gelatina.
6. Tell me the FPS, anything that feels wrong (reach, hit feel, telegraph readability), and whether the Queen feels fair.

## M0: Foundations (done, phone-tested)

A playable test arena: a KayKit Knight with a sword and shield runs, idles and attacks 30 training dummies, with a follow camera, a floating joystick, six skill buttons, damage numbers and a debug panel. It installs as a PWA and reloads offline.

### Checklist (PRD Section 17)

- [x] Vite, TypeScript and three.js project, with a Pages workflow (`.github/workflows/deploy.yml`). **The preview is not live until the repo is public, Pages is switched to GitHub Actions and this branch is merged to `main`.**
- [x] Landscape handling with the rotate screen, safe areas and blocked touch defaults (checked in headless Chromium; Safari still to check)
- [x] Floating joystick, 6 skill buttons, keyboard and mouse. The joystick and a skill button work at the same time (checked with two simultaneous touches in headless Chromium; a real phone is still to check)
- [x] Camera follow in a test arena with one KayKit hero (idle, run, attack). The 5 characters share one rig (see DECISIONS.md, item 8, about the standalone animations pack)
- [x] Auto-attack against 30 instanced training dummies, with damage numbers
- [x] Debug panel: FPS, draw calls, triangles, time scale, god mode (a flag only until M1), bone names
- [x] Installs to the Home Screen and reloads offline (confirmed on a real iPhone)
- [x] About 60 fps in the test arena (confirmed on a real iPhone; the scene is 20 draw calls and about 18.7k triangles against budgets of 120 and 200k). Only the iPhone was tested, not a second Android reference phone.

### Test results

- `npm test`: 36 tests pass (RNG, fixed stepper, damage, geometry, sim, joystick, data schemas, rig).
- `npm run lint`, `tsc --noEmit` and `npm run build` are clean. First download is about 4.1 MB (models 3.2 MB) against the 15 MB budget.
- Headless run at 844x390 with touch emulation: no console errors, 20 draw calls, joystick plus skill at once, drag-to-aim and cancel, tap-to-focus, keyboard and mouse, Esc pause, the portrait rotate screen, and an offline reload.

### Known issues

- An Android reference phone has not been tested yet.
- The dummy renderer positions instances once, so moving a dummy in the sim at run time does not move its model. Dummies never move in M0.
- God mode and time scale only affect the sim as flags and speed. Nothing attacks the hero until M1.
- The two diagrams in the PRD export ("core loop" and "build roadmap") are placeholders in the markdown.

### How to test on your iPhone

1. Make the repo public (Settings, General, Danger Zone, Change visibility).
2. Settings, Pages, Source: **GitHub Actions**.
3. Merge the PR to `main`. The Deploy workflow runs, and the site appears at `https://oswaldogwendy-del.github.io/jobforge/`.
4. In Safari on the iPhone open that URL and play in landscape. Check that the top-right number (FPS) holds near 60 while you run and fight.
5. Tap Share, then Add to Home Screen, and launch from the new icon. Turn on Airplane mode and open it again to check the offline reload.
6. Tell me the FPS you see and anything that feels wrong (joystick, buttons, notch overlap).
