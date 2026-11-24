# Jobforge — Browser ARPG PRD (Battleheart Legacy-style)

Nov 24, 2026 · @Gwendy

Jobforge is a phone-first 3D browser action RPG in the spirit of Battleheart Legacy: one hero, 12 class trainers, 96 skills, and six Ragnarok-style stats that decide which skills you can mix. You grind six zones, fight six bosses and climb an Endless Tower. There are no story quests. This PRD is the build spec for Claude Sonnet 5.5 (high effort).

## 0. How to use this PRD (read first)

Build Jobforge one milestone at a time (Section 17). Treat every number as a starting value to tune, and keep all game content in data files.

### Ground rules

1. **Read the whole PRD first.** Build milestones in order, M0 to M5. A milestone is done only when its checklist passes on a real phone.
2. **Content is data.** Classes, skills, monsters, bosses, items, cards, zones and balance constants live in JSON under `src/data/`. Code implements systems and the skill-effect primitives (Section 7). A boss may have one small script for its unique mechanic, built on the shared attack and telegraph primitives.
3. **Numbers are starting values.** Every constant goes in `src/data/balance.json`. Tune with the headless simulator (Section 4), not by editing code.
4. **Phone first.** The performance budgets in Section 4 are requirements. Test each milestone on an iPhone and an Android phone. Chrome DevTools mobile emulation with 4× CPU throttling is a stand-in, not a replacement.
5. **Keep the simulation pure.** `src/sim/` never imports three.js or the DOM, so it runs in unit tests and in the simulator.
6. **Decide, log, continue.** Where this PRD is silent, pick the simplest option that keeps the pillars (Section 1), record it in `DECISIONS.md` and keep going. Stop to ask only when a milestone is blocked. Known open items are in Section 19.
7. **Original IP only.** Borrow systems from Battleheart Legacy and Ragnarok Online, never their names, art, sound, text or UI. Use the CC0 packs in Section 15, or other CC0 sources logged in `CREDITS.md`.

### Hand back after each milestone

- A playable build: a deployed preview URL, or `npm run dev -- --host` for phones on the same Wi-Fi.
- A `CHANGELOG.md` entry, known issues and an updated `DECISIONS.md`.
- The test and simulator results that the milestone's checklist names.

### Glossary

| Term | Meaning |
| --- | --- |
| Base level | Hero level, 1–99. Each level gives stat points and 1 skill point |
| Stat points | Spent on STR, AGI, VIT, INT, DEX and LUK in the Status window (Section 6) |
| Skill points (SkP) | Spent to raise a learned skill's rank (rank 2 and up) |
| SP | Mana. Skills cost SP |
| Class / trainer | One of 12 skill schools. The hero is never locked to a class |
| Requirement | Stat values a skill needs before it can be learned or equipped |
| Dormant skill | A learned skill whose requirement is no longer met. It stays learned but can't be equipped |
| Affinity | Weapon types that give a skill +25% damage. Never required |
| Boss gauge | Fills from field kills. When full, the zone's boss portal opens |
| Elite | Mini-boss that spawns in the field about every 2.5 minutes |
| Card | Rare monster drop socketed into gear for a passive bonus |
| Refine | Upgrading gear from +1 to +10 at the Blacksmith |
| Preset | A saved build: stats, skills and gear. Up to 3 |
| Telegraph | Ground shape that warns of a big enemy attack before it lands |

## 1. Product summary

Jobforge is a single-player browser ARPG for phones where one hero can learn any of 96 skills. The only thing standing between a Necromancer and Heal is the hero's stats.

### Pitch

Pick a look and a starter weapon, then spend stat points the way you would in Ragnarok Online. Twelve class trainers sell skills, and each skill unlocks once your stats meet its requirement, as in Battleheart Legacy. Mix freely: a Necromancer who heals, a Paladin who goes Berserk, a Mage with ninja dashes, a Monk with a gun. Grind a zone until its boss gauge fills, beat the boss, rebuild, and go again.

### Target player

- Gwendy first, then fans of Battleheart Legacy and Ragnarok Online.
- 5–15 minute sessions on a phone in landscape. Keyboard and mouse also work on desktop.

### Pillars

1. **Build anything.** 96 skills from 12 classes, and any learned skill fits any slot. Stats are the only gate.
2. **Stats are the build.** Six hand-allocated stats decide both power and which skills you can use.
3. **Grind, then boss.** Field kills fill a boss gauge. Bosses are the payoff, the skill check and the main source of unlocks.
4. **Phone first.** One-thumb movement, smart-cast skill buttons, 60 fps on mid-range phones, and a full loop in about 10 minutes.
5. **Loot with a long tail.** Gear with card slots, 48 monster cards, and refining to +10.

### What we borrow

| From | Borrow | Leave behind |
| --- | --- | --- |
| Battleheart Legacy | One hero. Class trainers whose skills need stat values and gold ([rogue example](https://www.pocketgamer.com/articles/059893/r/)). A free mix of actives and passives across [12 classes](https://www.pocketgamer.com/battleheart-legacy/battleheart-legacy-every-skill-tree-for-every-class/). A skill bar that locks once you enter a hostile zone ([wiki](https://battleheartlegacy.fandom.com/wiki/Combat?oldid=8316)). The cute 3D look | Story and trainer quests, tap-to-move, skills that require a specific weapon, all names |
| Ragnarok Online | Six stats with rising point costs ([stats](<https://ragnarok.fandom.com/wiki/Stats_(RO)>)). Base level to 99. Elements and monster races. Monster cards socketed into gear. Refining. Boss announcements. An endless tower. Class flavors such as Knight, Priest, Monk, Ninja and Gunslinger | MMO and online play, job-change quests, weight limits, all names (no Poring, Prontera or Zeny) |

### Not in v1

- Story, NPC dialogue or quest chains
- Multiplayer, PvP, accounts or cloud saves
- Ads, in-app purchases or any monetization
- Crafting beyond refining and cards, pets, housing, guilds
- A walkable town (the town is a menu hub)

## 2. Locked decisions

Gwendy set the four big decisions. The rest are defaults Claude chose, and any of them can change. If a row here conflicts with another section, the table wins.

| Topic | Decision | Set by |
| --- | --- | --- |
| Skill mixing | Stats unlock skills (Battleheart Legacy style). Any learned skill fits any slot | Gwendy |
| Visual style | 3D low-poly chibi look from free CC0 model packs (KayKit, Quaternius), fixed 3/4 camera | Gwendy |
| Controls | Floating joystick. The hero auto-attacks while standing still. Tap an enemy to focus it. Six skill buttons: tap to smart-cast, drag to aim | Gwendy |
| v1 size | 12 classes, 96 skills, 6 zones, 6 bosses, Endless Tower | Gwendy |
| Orientation | Landscape only. Portrait shows a "rotate your phone" screen | Default |
| Mode | Single-player and works offline. Saves stay on the device, with export and import | Default |
| Platform | Static web app (installable PWA) built with Vite, TypeScript and three.js | Default |
| Auto-battle | Toggle for fields and Tower floors, unlocked after Boss 1. Off in boss fights | Default |
| Respec | Stat reset at the Oracle: free up to level 20, then 5 × level² gold. Skill ranks reset free | Default |
| Skill bar | Locked once you enter a zone. Change it in town | Default |
| Death | Return to town and keep loot and EXP. In Nightmare, lose 1% of the current level's EXP | Default |
| Monetization | None | Default |
| Language | English, with every string in one file for a later Bahasa Indonesia pass | Default |
| Working title | Jobforge | Default |

## 3. Core loop

One loop drives the game: build in town, grind a zone until its boss gauge fills, beat the boss, then rebuild with what dropped.

&#91;embedded content: core loop · 5 stops, 2 ways back\]

The dashed path is the way out: leaving or dying at any point returns the hero to town with everything collected so far.

### How a run plays

- A field run has no timer. It ends when you leave or die. Filling the gauge takes about 4–6 minutes at the zone's level: the gauge holds 100, a normal kill adds 1 and an elite adds 10.
- When the gauge fills, a banner names the boss ("The Queen stirs in Meadowmere…") and a portal opens near the hero. Entering it loads the boss arena. If you keep grinding instead, the gauge stays full.
- A boss fight should take 2–3 minutes on Normal with an on-level build.
- The victory chest offers Grind again (back to the field with the gauge reset) or Return to town.
- Dying ends the run. You keep all loot and EXP and go back to town.
- Boss Sigils, dropped by elites, open a boss straight from the World Map.
- First boss kills unlock trainers, skill slots and the next zone (Section 11).

### After the loop is mastered

- **Endless Tower** (after Boss 3): floor-by-floor arenas with a boss every 10 floors.
- **Nightmare** (after Boss 6): every zone again, harder, with better drops.
- **The long tail:** 48 monster cards to collect, refining to +10, and three build presets to fill.

## 4. Platform & tech

Ship a static TypeScript web app: Vite builds it, three.js renders it, and it installs to the phone's Home Screen as an offline PWA.

### Targets

| Platform | Browser |
| --- | --- |
| iPhone | Safari on the two latest iOS versions, played from the Home Screen |
| Android | Chrome, two latest versions |
| Desktop | Chrome, Edge, Safari and Firefox, with keyboard and mouse |
| Reference phones for budgets | An iPhone 12-class device and a mid-range Android (Galaxy A5x-class) |

### Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, strict mode | No `any` in `src/sim/` |
| Build | Vite | Static output in `dist/`, deployable to any static host |
| 3D | three.js with `WebGLRenderer` (WebGL 2) | WebGPU is out of scope for v1 |
| UI | Preact and CSS for menus and the HUD shell | Damage numbers draw on a 2D canvas overlay |
| Storage | IndexedDB (idb-keyval), localStorage fallback | Versioned save schema |
| Offline | vite-plugin-pwa (Workbox) | Precache the app and every asset |
| Tests | Vitest | Formulas, skill effects, save migrations |
| Lint | ESLint and Prettier |  |

### Folder structure

```text
src/
  core/     game loop, fixed timestep, seeded RNG, event bus, object pools
  sim/      entities, stats and formulas, combat, skill engine, statuses, AI, spawner, loot, bosses/
  render/   scene, asset loader, entity views, animation, VFX, telegraphs, camera
  ui/       Preact screens, HUD, damage-number canvas
  input/    joystick, skill buttons, keyboard and mouse
  data/     classes, skills, summons, monsters, bosses, zones, items, cards, balance, modelMap, strings (JSON)
  save/     schema, migrations, storage adapter, export/import
  audio/    mixer and sound banks
  debug/    cheat panel, performance overlay
tools/sim/  headless build simulator (Node)
public/assets/  models (.glb), textures, audio, fonts, icons
```

### Runtime rules

- The simulation ticks at a fixed 30 Hz. Rendering runs at the display rate and interpolates between ticks.
- Game logic is 2D on the ground plane (x, z). Entities are circles and obstacles are circles or boxes. A spatial hash with 4 m cells answers range queries. There is no physics engine.
- Movement uses steering with separation. Grid A\* on 1 m cells runs only when the straight line to a target is blocked.
- Each run uses a seeded RNG, and bug reports include the seed.
- Monsters, projectiles, VFX and damage numbers come from object pools. Hot paths allocate nothing per frame.

### Performance budgets

| Budget | Limit |
| --- | --- |
| Frame rate | 60 fps on the reference phones. The Low preset holds 30 fps on a 4-year-old phone |
| Draw calls | 120 |
| Visible triangles | 200k |
| Monsters alive | 30 in the field. In a boss arena, the boss plus 12 adds |
| Projectiles | 150 |
| Animated skinned meshes | 40. Distant ones update animation at 15 Hz |
| Texture memory | 64 MB |
| JS heap | 150 MB steady, with no growth over a 2-hour session |
| First download | 15 MB, cached after that |
| Boot to title | 5 s on a first 4G load, 2 s when cached |

Graphics presets:

- **High:** pixel ratio up to 2, one 1024 shadow map for the hero and bosses.
- **Medium:** pixel ratio up to 1.5, blob shadows.
- **Low:** pixel ratio 1, blob shadows, half the particles, 30 fps cap.
- **Auto:** picks a preset from a 3-second benchmark, then lowers resolution if frames run over 20 ms for 2 seconds.

### Saves

- Three hero slots. Autosave on zone exit, level-up and boss kill, and every 60 s in town.
- The save schema has a version number and a migration for every change. A unit test loads a saved file from every past version.
- Export and Import turn the save into a text code (compressed JSON in base64), from both the Title screen and Settings.
- Call `navigator.storage.persist()` on first launch.
- Safari deletes a site's script-writable storage after 7 days of Safari use without a visit, but Home Screen web apps keep their own count ([details](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/)). So on iOS, show a one-time "Add to Home Screen" guide, and remind players now and then to export their save.

### Install and offline

- Manifest: name, short name, 192 and 512 px icons (plus maskable), `display: fullscreen` with standalone as fallback, `orientation: landscape`, theme and background colors. Android respects the orientation; iOS gets the rotate screen.
- The service worker precaches everything. When a new version is ready, show "Update ready, tap to restart" in town only, never mid-run.

### Dev setup

- Use the current Node LTS. On a Windows PC without admin rights, use Node's portable .zip instead of the installer, alongside PortableGit.
- Test on phones with `npm run dev -- --host` over the same Wi-Fi, or with preview deploys to a static host such as GitHub Pages, Cloudflare Pages or Netlify.

### Simulator

`npm run sim -- --build=builds/lich-saint.json --zone=3 --minutes=10` runs the simulation headless at 50× speed. It reports kills per minute, EXP per minute, damage per second, damage taken, deaths and boss kill time. Tune `balance.json` with it until the targets in Section 13 are met.

## 5. Controls, camera & HUD

The left thumb moves, the hero auto-attacks whenever it stands still, and the right thumb fires six skills that cast on a tap or aim on a drag.

### Touch controls

- **Move:** a floating joystick appears wherever the thumb lands in the left 45% of the screen. Dead zone 8%, maximum radius 60 CSS px, analog speed (half tilt or more = full speed).
- **Auto-attack:** when the joystick is released, the hero attacks the focus target, or else the nearest enemy within 10 m, stepping into weapon range. Moving cancels an attack wind-up, so the rhythm is stop to attack, move to dodge.
- **Focus:** tap an enemy to focus it (a ring appears under it). Tap it again or tap empty ground to clear. Bosses are focused automatically, and elites get an off-screen arrow.
- **Skills:** six buttons in an arc at the bottom right (68 px, or 56 px on small phones), with two potion buttons above them.

| Skill target type | Tap | Drag, then release |
| --- | --- | --- |
| Self or around self | Casts at once | Same as tap |
| Single enemy | Focus target, else nearest in range. Shows "No target" and spends nothing if there is none | Aims at a different enemy (snaps to the nearest one under the aim line) |
| Direction (line, cone, projectile, dash) | Toward the focus or nearest enemy, else the facing direction | An arrow shows the direction |
| Ground area | On the focus or nearest enemy, else 4 m ahead | A reticle moves on the ground within range |

- Dragging back onto the button cancels the cast.
- A cast time roots the hero. Moving the joystick during a cast cancels it, and no SP is spent. A 0.4 s global cooldown separates skills.
- Melee-range skills step up to 4 m toward the target before striking.
- Button states: a cooldown sweep with seconds left; a blue tint when SP is short; a red ring when no target is in range; a gold pulse when a resource bonus is ready (orbs or coins).
- Track every pointer by id. The joystick and a skill button must work at the same time.

### Keyboard and mouse

WASD or arrow keys move. Keys 1–6 cast toward the mouse cursor, and ground skills land at the cursor. Q and E use potions. Left-click an enemy to focus it, Tab cycles targets, Space toggles auto-battle and Esc pauses.

### Camera

Perspective camera, 40° field of view, 55° pitch, 18 m distance (22 m in boss arenas). North stays up and the camera never rotates. It follows the hero smoothly with a 2 m look-ahead in the movement direction. Heavy hits add a small screen shake, which players can turn off.

### HUD layout

| Area | Contents |
| --- | --- |
| Top left | HP bar, SP bar, thin base-EXP bar, level, buff and debuff icons |
| Top center | Boss gauge in fields. In boss arenas: the boss HP bar with phase ticks and a stagger bar |
| Top right | Pause, auto-battle toggle, run timer |
| Bottom left | Joystick area, invisible until touched |
| Bottom right | Six skill buttons and two potion buttons |
| In the world | Damage numbers, enemy HP bars (shown only once damaged), telegraphs, loot beams |

- Damage numbers: white for hits, yellow for crits, red for damage taken, green for heals, blue for SP and grey for "Miss". Settings offer compact numbers (1.2k) or none.
- Loot: drops fly to the hero on their own 0.5 s after a kill, with a beam colored by rarity. A card drop shows a gold "CARD!" banner with its own sound.

### Phone ergonomics

- Set `touch-action: none` on the game canvas, and block pinch zoom, double-tap zoom, pull-to-refresh (`overscroll-behavior: none`), text selection and long-press menus.
- Keep the HUD inside the safe areas (`env(safe-area-inset-*)`) for notches and the home bar.
- Pause on `visibilitychange` and when the phone turns to portrait.
- Unlock audio on the first touch by resuming the AudioContext.
- Use `navigator.vibrate` for haptics where it exists (Android). On iOS it does nothing.
- Settings include a left-handed mode that mirrors the HUD, UI scale from 85% to 125%, and a fixed or floating joystick.

## 6. Stats (Status window)

Six stats run everything. Players spend points by hand, costs rise every 10 points, and the same numbers decide both damage and which skills unlock.

### What each stat does

| Stat | Raises | Leans toward |
| --- | --- | --- |
| STR | Melee ATK, a little ranged ATK | Knight, Berserker, Monk, Merchant |
| AGI | Attack speed, FLEE (dodge) | Thief, Ninja, Monk |
| VIT | Max HP, HP regen, DEF, resistance to physical statuses | Paladin, Knight, Priest |
| INT | MATK, Max SP, SP regen, MDEF, resistance to magical statuses | Mage, Priest, Necromancer |
| DEX | HIT, bow and gun ATK, cast speed | Archer, Gunslinger, Mage |
| LUK | Crit, perfect dodge, drop rate, a little ATK | Thief, Gunslinger, Merchant |

### Stat points

Every stat starts at 1, and a new hero has 48 points to spend. These two rules come straight from Ragnarok Online ([points](<https://ragnarok.fandom.com/wiki/Stats_(RO)>), [costs](https://irowiki.org/wiki/Total_stat_point_requirement)):

```latex
\text{points gained from level } x \text{ to } x+1 = \left\lfloor x/5 \right\rfloor + 3
```

```latex
\text{cost to raise a stat from } n \text{ to } n+1 = \left\lfloor (n-1)/10 \right\rfloor + 2
```

- That gives 210 points by level 30, 555 by level 60, 885 by level 80 and 1,273 by level 99.
- Reaching 20 in one stat costs 47 points, 40 costs 135, 60 costs 263, 80 costs 431 and 99 costs 628. A level-99 hero can max about two stats.
- Base stats cap at 99. Gear, cards and buffs can push the effective value higher.

### Derived stats

These are starting values. L is the base level, and stats are effective values (base plus gear, cards and buffs).

| Derived stat | Formula | Cap |
| --- | --- | --- |
| Max HP | (80 + 12L + 0.25L²) × (1 + VIT/100) + gear HP, then × (1 + HP% bonuses) | — |
| Max SP | (20 + 3L + 0.05L²) × (1 + INT/100) + gear SP | — |
| ATK with a melee weapon | STR + ⌊STR/10⌋² + ⌊DEX/5⌋ + ⌊LUK/5⌋ + weapon ATK × (1 + refine bonus) + flat bonuses | — |
| ATK with a bow or gun | DEX + ⌊DEX/10⌋² + ⌊STR/5⌋ + ⌊LUK/5⌋ + weapon ATK × (1 + refine bonus) + flat bonuses | — |
| MATK | Rolled between INT + ⌊INT/7⌋² and INT + ⌊INT/5⌋², plus weapon MATK × (1 + refine bonus) | — |
| HIT | L + DEX + bonuses | — |
| FLEE | L + AGI + bonuses | — |
| Chance to land a physical hit | 80 + attacker HIT − defender FLEE, in % | 15–100% |
| Perfect dodge (physical only) | 1 + LUK/10, in % | 30% |
| Crit chance | 1 + 0.3 × LUK, in %, plus bonuses | 80% |
| Crit damage | ×1.5 plus bonuses. Crits always hit | — |
| Attacks per second (APS) | Weapon APS × (1 + 0.008 AGI + 0.002 DEX + APS% bonuses) | 3.0 |
| Cast time | Base × max(0.2, 1 − DEX/150 − cast-speed bonuses) | 20% of base |
| Cooldown reduction | Gear and passives only | 40% |
| DEF | Armor DEF + 0.5 VIT + 0.25L. Physical damage taken × 100 / (100 + DEF) | 80% reduction |
| MDEF | Gear MDEF + 0.5 INT + 0.2 VIT + 0.25L. Magic damage taken × 100 / (100 + MDEF) | 80% reduction |
| HP regen per second | 0.2% of Max HP + 0.05 VIT, ×5 after 4 s without taking damage | — |
| SP regen per second | 0.5 + 0.4% of Max SP + 0.04 INT, ×3 out of combat | — |
| Status resist | Stun, poison, bleed: 0.4% × (VIT + LUK/2). Freeze, silence, curse, blind: 0.4% × (INT + LUK/2) | 75% |
| Drop rate bonus | +0.3% (relative) per LUK, plus gear and passives | +100% total |
| Move speed | 5.0 m/s plus bonuses | +60% |

Ragnarok's LUK doesn't touch drop rates. Jobforge adds a small bonus on purpose so that farming builds exist.

### Status window rules

- Each "+" button shows its cost. Changes stay pending until Confirm, and Undo clears them.
- The preview shows every derived stat's change (green up, red down) and an Unlocks list, for example "INT 10: can learn Heal (Priest) and Bone Servant (Necromancer)".

### Requirements, resets and presets

- Skill requirements count base stats plus equipment and card bonuses. Buffs and passive skill bonuses never count.
- A stat reset at the Oracle refunds every point. It's free up to level 20, then costs 5 × L² gold (12,500 at level 50, 49,005 at level 99). An Oblivion Draught, a rare drop, resets for free.
- After a reset or a gear change, any equipped skill whose requirement fails turns dormant and is unequipped. A dialog lists those skills before you confirm.
- Presets hold up to 3 builds, each with its own stat allocation, skill loadout and equipped gear (items are shared references). Slot 2 unlocks after Boss 5 and slot 3 after Boss 6. Switching is free, in town only.

## 7. Skill system & mixing rules

Any learned skill fits any slot. To learn or equip one, the hero needs its trainer unlocked, its stat requirement met and the gold to buy it.

### Learning a skill

1. **Trainer unlocked.** The six basic trainers are open from the start. The six advanced trainers unlock from Bosses 1–3 (Section 11).
2. **Stat requirement met.** Base stats plus equipment and card bonuses. Some skills need two stats.
3. **Tier prerequisite.** A tier-N skill needs at least one tier-(N−1) skill from the same trainer already learned.
4. **Gold paid.** 100 for tier 1, 600 for tier 2, 2,500 for tier 3, 8,000 for tier 4 and 25,000 for an ultimate.

Learning gives rank 1. Each further rank costs 1 skill point, up to rank 5 (ultimates stop at rank 3). Heroes earn 1 skill point per level and 2 per first boss kill, 110 in total by level 99. Skill ranks reset for free at the Guild Hall. The class tables list values as "r1 → r5" (or r1 → r3 for ultimates); ranks in between interpolate linearly.

### Tiers at a glance

| Tier | Requirement (main / second stat) | Gold | SP | Cooldown |
| --- | --- | --- | --- | --- |
| 1 | 5–10 | 100 | 6–18 | 3–10 s |
| 2 | 20–25 / 10–15 | 600 | 12–20 | 5–30 s |
| 3 | 30–40 / 15–30 | 2,500 | 15–35 | 6–40 s |
| 4 | 60 / 25–30 | 8,000 | 30–55 | 12–45 s |
| 5 (ultimate) | 80 / 40 | 25,000 | 70–100 | 45–90 s |

### Loadout

| Slot | Count | Unlock |
| --- | --- | --- |
| Active (skills and toggles) | 4, rising to 6 | 5th after Boss 1, 6th after Boss 2 |
| Passive | 2, rising to 4 | 3rd after Boss 3, 4th after Boss 4 |
| Consumable | 2 | From the start |

- The loadout locks once you enter a zone or the Tower. Set it in town.
- The build title shows the hero's top two classes by equipped skills, for example "Necromancer · Priest".

### Weapon affinity

A skill lists zero to two weapon types. With a matching weapon equipped, the skill gets +25% damage (or +25% effect if it deals no damage). Without one it works normally. No skill ever requires a weapon. A gun or bow skill used without that weapon fires spectral projectiles with the same visuals, tinted.

A skill that says ATK uses the hero's current ATK, which depends on the equipped weapon (the melee or the bow-and-gun formula in Section 6). A skill that says MATK uses MATK.

### Tags

Every skill carries tags: melee, ranged, magic, physical, aoe, projectile, dash, summon, heal, shield, buff, debuff, aura, toggle, trap, combo, finisher, stealth, loot, plus one element (fire, water, wind, earth, poison, holy, shadow, ghost). Passives and cards target tags ("summon skills +20%"). Tags are what make cross-class combos work.

### Class resources

- **Spirit Orbs** (Monk), up to 5.
- **Coins** (Gunslinger), up to 10.
- **Missing HP** (Berserker) scales Bloodlust.

Resource pips appear above the HP bar only when an equipped skill uses them.

### Caps against runaway combos

Keep these in `balance.json`:

- Cooldown reduction 40% at most. Cast time at least 20% of base. APS 3.0 at most. Move speed bonus +60% at most.
- DEF and MDEF reduce damage by 80% at most. All damage reduction combined stops at 85%.
- Crit chance 80% at most. Perfect dodge 30% at most. Enemy hit chance never below 15%.
- Lifesteal at most 15% of damage dealt and 5% of Max HP per second.
- Drop rate bonus +100% at most. Gold bonus +200% at most.
- A proc can't trigger another proc, and every proc has an internal cooldown of at least 0.5 s.
- At most 8 summons alive. Summon hits don't trigger the hero's on-hit passives unless a passive says so.
- A repeat stun, freeze or root on the same target within 6 s lasts half as long. Bosses ignore these effects; instead, each one fills a stagger bar, and at 100 the boss is staggered for 2 s and takes 20% more damage.

### Skill engine primitives

Every skill is built from these pieces in JSON (schemas in Section 16). The engine runs a skill's effects in order.

| Primitive | Does | Main parameters |
| --- | --- | --- |
| damage | Hits targets | physical or magic, element, ATK% or MATK%, hits, can crit, ignore DEF% |
| projectile | Spawns moving hitboxes | speed, count, spread, pierce, homing, effects on hit |
| area | Applies effects in a shape over time | circle, cone, line, donut or cross; size; at self, target or ground; delay, duration, tick |
| heal | Restores HP | MATK%, Max HP%, who (self, summons) |
| shield | Absorbs damage | Max HP% + MATK%, duration |
| status | Applies a status | stun, freeze, root, slow, burn, poison, bleed, blind, silence, curse, mark; chance, duration, power |
| buff / debuff | Changes stats | stat modifiers, duration, target |
| dash | Moves the hero | distance, speed, invulnerable time, effects on arrival |
| summon | Spawns allied units | unit id, count, duration, max alive |
| displace | Knockback or pull | distance |
| taunt | Forces enemies to target the caster | radius, duration |
| cleanse | Removes debuffs | count |
| resource | Gains or spends orbs or coins | type, amount |
| toggle | Ongoing modifiers that drain SP | modifiers, SP per second |
| trigger | Passive procs | on hit, crit, kill, block, damaged, low HP, dodge, lethal or summon death; chance, internal cooldown |
| modifier | Passive bonuses | tag filter, stat, value |

## 8. Classes & skills — basic six

The six basic trainers are open from the start. Between them they cover every main stat, so any starting stat spread can learn something useful. Skill names are original; the class notes say which Ragnarok jobs each one nods to.

### Knight

Front-line bruiser who pulls packs together and hits hard. Main stats STR and VIT. Affinity: sword, greataxe. Nods to Ragnarok's Swordman and Knight.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Crushing Blow | Active · enemy | STR 5 | 8 · 4 s | Strike for 180% → 300% ATK. At r5, 25% chance to stun for 1 s |
| 1 | Iron Body | Passive | VIT 5 | — | +3% → 15% Max HP and +5 → 25 DEF |
| 2 | Flame Burst | Active · around self (4 m) | STR 20 | 15 · 8 s | 150% → 250% ATK fire and a 2 m knockback. Basic attacks deal +10% fire damage for 10 s |
| 2 | Provoke Roar | Active · around self (8 m) | VIT 20 | 12 · 10 s | Taunt enemies for 4 s and pull them 2 m closer. They lose 10% → 30% DEF |
| 3 | Crescent Sweep | Active · cone (120°, 5 m) | STR 40 | 25 · 9 s | 220% → 400% ATK. +30% against stunned enemies |
| 3 | Unyielding | Passive · trigger | VIT 40 | — | When HP drops below 40%: immune to stun and knockback and +20 → 40 DEF for 6 s. Cooldown 30 s |
| 4 | Bulwark Charge | Active · direction (8 m) | STR 60, VIT 25 | 40 · 14 s | Charge through enemies for 250% → 420% ATK and knock them back 3 m |
| 5 | Kingsblade Oath | Ultimate · self | STR 80, VIT 40 | 70 · 75 s | For 20 s: basic attacks add 100% → 160% ATK that ignores DEF, +30% APS, and skills cost 30% less SP |

### Mage

Elemental artillery that freezes, burns and blows up packs from range. Main stats INT and DEX. Affinity: staff. Nods to Ragnarok's Mage and Wizard.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Ember Bolt | Active · enemy (projectile) | INT 5 | 10 · 3 s, cast 0.6 s | 160% → 300% MATK fire. Burn chance 20% → 100% for 3 s |
| 1 | Arcane Mind | Passive | INT 5 | — | +5% → 25% Max SP and +0.5 → 2.5 SP regen per second |
| 2 | Frost Lance | Active · enemy (projectile) | INT 20 | 12 · 6 s, cast 0.6 s | 140% → 260% MATK water. Freeze chance 30% → 50% for 2 s |
| 2 | Chain Lightning | Active · enemy | INT 25, DEX 10 | 18 · 7 s, cast 0.8 s | 150% → 250% MATK wind, then jumps to 2 → 4 more enemies within 5 m, −20% per jump |
| 3 | Wall of Flame | Active · ground (6 m line) | INT 40 | 28 · 15 s, cast 1 s | A wall of fire for 6 s. Enemies touching it take 80% → 140% MATK fire every 0.5 s and are pushed back (bosses aren't) |
| 3 | Spell Focus | Passive | INT 30, DEX 30 | — | Magic skills cast 5% → 20% faster and deal 4% → 12% more damage |
| 4 | Glacial Storm | Active · ground (6 m) | INT 60, DEX 25 | 50 · 20 s, cast 1.5 s | 10 hits over 4 s, 40% → 70% MATK water each. Each hit has an 8% freeze chance |
| 5 | Cataclysm | Ultimate · ground (7 m) | INT 80, DEX 40 | 90 · 60 s, cast 2 s | 6 → 10 meteors over 3 s, each 220% → 330% MATK fire in 2.5 m plus a 1 s stun |

### Archer

Ranged physical damage with traps, marks and a falcon. Main stats DEX and AGI. Affinity: bow. Nods to Ragnarok's Archer and Hunter.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Double Shot | Active · enemy | DEX 5 | 8 · 3 s | Two arrows, 110% → 190% ATK each |
| 1 | Eagle Eye | Passive | DEX 5 | — | +5 → 25 HIT. Ranged basic attacks and ranged skills gain +1 → 3 m range |
| 2 | Arrow Rain | Active · ground (4 m) | DEX 20 | 18 · 8 s | 3 waves over 1.5 s, 90% → 160% ATK each |
| 2 | Snare Trap | Active · ground | DEX 20, AGI 10 | 12 · 6 s | Place a trap (up to 3, each lasts 30 s). The first enemy to step on it takes 100% → 200% ATK and is rooted for 3 → 5 s |
| 3 | Piercing Arrow | Active · direction (14 m line) | DEX 40 | 25 · 9 s | Pierces everything for 250% → 420% ATK and marks each enemy hit for 6 s: it takes +10% → 20% damage from all sources |
| 3 | Falcon Strike | Passive · trigger | DEX 40, AGI 20 | — | Basic attacks have an 8% → 20% chance to call a falcon dive: 200% → 350% ATK wind in 2 m that always hits |
| 4 | Fan of Arrows | Active · cone (90°, 10 m) | DEX 60, AGI 30 | 45 · 15 s | 9 → 13 arrows, 120% → 180% ATK each. One enemy takes at most 3 |
| 5 | Thousand Arrows | Ultimate · ground (6 m) | DEX 80, AGI 40 | 85 · 70 s | Channel for 3 s while rooted: 30 arrows, 70% → 100% ATK each. Rooted or marked enemies take double |

### Priest

Healer and holy caster, and the easiest class to splash into any build. Main stats INT and VIT. Affinity: mace, staff. Nods to Ragnarok's Acolyte and Priest.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Heal | Active · self | INT 10 | 12 · 5 s, cast 0.4 s | Heal 120% → 240% MATK + 4% Max HP. Also heals your summons within 5 m and deals the same amount as holy damage to Undead within 3 m. From r3, removes 1 debuff |
| 1 | Divine Favor | Passive | INT 5 | — | +2 → 10 STR, INT and DEX. These are bonus stats, so they don't count toward requirements |
| 2 | Radiant Bolt | Active · enemy (projectile) | INT 20 | 14 · 5 s, cast 0.5 s | 180% → 320% MATK holy. +50% against Undead and shadow-element enemies |
| 2 | Blessed Ward | Active · self | INT 20, VIT 10 | 20 · 14 s | A shield of 15% → 35% Max HP + 100% MATK for 8 s |
| 3 | Hallowed Ground | Active · ground (5 m) | INT 40, VIT 20 | 35 · 20 s | For 8 s, heals you and your summons inside for 30% → 60% MATK per second. Undead and Demons inside take that much as holy damage per second |
| 3 | Second Wind | Passive · trigger | VIT 40 | — | Lethal damage leaves you at 1 HP, then heals 20% → 40% Max HP and adds a 3 s shield of 30% Max HP. Cooldown 300 → 180 s |
| 4 | Judgment Circle | Active · ground (6 m) | INT 60, VIT 25 | 55 · 22 s, cast 1.2 s | After 1 s, 8 hits over 4 s, 60% → 100% MATK holy each. Undead, Demons and shadow-element enemies take double |
| 5 | Divine Intervention | Ultimate · self | INT 80, VIT 40 | 90 · 90 s | For 8 s, HP can't drop below 1, you heal 6% → 10% Max HP per second, and holy damage is +50% |

### Thief

Fast crit-and-poison fighter who also pockets extra loot. Main stats AGI and LUK. Affinity: dagger. Nods to Ragnarok's Thief and Assassin.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Viper Fang | Active · enemy | AGI 10 | 10 · 5 s | 150% → 260% ATK and poison for 5 s (25% → 45% ATK per second) |
| 1 | Twin Strike | Passive | AGI 5 | — | Basic attacks have a 5% → 25% chance to hit twice (1.5× that chance with a dagger) |
| 2 | Umbral Step | Active · enemy (blink, 8 m) | AGI 20, LUK 10 | 12 · 8 → 6 s | Blink behind the target. Your next hit within 2 s is a crit, and you gain +20% → 40% FLEE for 3 s |
| 2 | Pickpocket | Passive · trigger | LUK 20 | — | Kills have a 5% → 15% chance of an extra loot roll, and give +10% → 30% gold |
| 3 | Knife Flurry | Active · enemy | AGI 40, LUK 15 | 30 · 10 s | 8 strikes over 0.8 s, 45% → 70% ATK each |
| 3 | Evasion Mastery | Passive | AGI 40 | — | +5 → 25 FLEE and +1% → 5% perfect dodge. After a dodge, +10% damage for 3 s |
| 4 | Veil of Night | Active · self (stealth) | AGI 60, LUK 30 | 30 · 18 s | Hidden for 3 → 5 s. Enemies lose track of you, and attacking ends it. Your first attack from stealth deals +100% → 200% damage and poisons |
| 5 | Razor Bloom | Ultimate · around self (5 m) | AGI 80, LUK 40 | 75 · 60 s | Spin for 3 s: 12 hits of 70% → 100% ATK with poison and bleed. +50% FLEE while spinning. Each crit takes 0.5 s off your other cooldowns |

### Merchant

Turns gold into damage and kills into more gold: the farming class. Main stats STR and LUK. Affinity: mace. Nods to Ragnarok's Merchant and Blacksmith.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Coin Smash | Active · enemy | STR 5 | 6, plus 5 × level gold · 4 s | 250% → 450% ATK |
| 1 | Haggle | Passive | LUK 5 | — | Shop prices −5% → −20%. Sell prices +5% → +25% |
| 2 | Wagon Wheel | Active · around self (3.5 m) | STR 20 | 14 · 7 s | Swing your loot cart for 160% → 280% ATK and a 2 m knockback. +1% damage per 1,000 gold carried, up to +30% |
| 2 | Lucky Find | Passive | LUK 20 | — | +4% → 20% drop rate and +2% → 10% card drop rate (relative) |
| 3 | Hired Guard | Active · summon | STR 30, LUK 30 | 25, plus 10 × level gold · 40 s | A mercenary fights for 30 s with 50% of your Max HP. It taunts within 5 m and hits for 60% → 120% ATK |
| 3 | Steady Hands | Toggle | STR 40 | 2 SP per second | Basic attacks always roll maximum damage and gain +10% → 30% ATK |
| 4 | Golden Avalanche | Active · ground (5 m) | STR 60, LUK 30 | 45, plus 30 × level gold · 20 s | 400% → 700% ATK and a 1.5 s stun. Enemies it kills drop +50% gold |
| 5 | Fortune's Favor | Ultimate · self | LUK 80, STR 40 | 80 · 90 s | For 30 s: +50% → 100% gold and drop rate (caps still apply), +30% → 50% crit chance, and every crit showers coins for 50% ATK in 2 m |

## 9. Classes & skills — advanced six

The six advanced trainers unlock two at a time from Bosses 1, 2 and 3, so every class is open by about level 40 and the second half of the game is for hybrids.

### Berserker (unlocked by Boss 1)

Gets stronger as HP drops and heals by hitting. Main stats STR and VIT. Affinity: greataxe. Nods to Ragnarok's Lord Knight frenzy.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Rending Chop | Active · enemy | STR 10 | 10 · 5 s | 200% → 340% ATK and bleed for 4 s (stacks to 3, 15% ATK per second per stack) |
| 1 | Bloodlust | Passive | STR 10 | — | +2% → 6% damage for every 10% of HP missing (up to +18% → +54%) |
| 2 | Berserk | Active · self | STR 20, VIT 15 | 20 · 30 s | For 10 → 15 s: +30% → 60% APS and +20% → 40% ATK, but −30% DEF and you lose 2% Max HP per second (never below 10%) |
| 2 | Reaper's Spin | Active · around self (3 m) | STR 25 | 20 · 9 s | Spin for 2 s while moving at half speed: 6 hits of 60% → 100% ATK |
| 3 | Skybreaker Leap | Active · ground (8 m range) | STR 40 | 25 · 10 s | Leap and land for 250% → 400% ATK in 3.5 m, slowing enemies 40% for 3 s |
| 3 | Blood Drinker | Passive | VIT 35, STR 25 | — | Lifesteal 2% → 6% of physical damage, doubled during Berserk |
| 4 | Rampage | Passive · trigger | STR 60, VIT 30 | — | Each kill gives +3% ATK and +2% APS for 6 s, stacking to 5 → 10. Every kill refreshes the stacks |
| 5 | Avatar of Wrath | Ultimate · self | STR 80, VIT 40 | 80 · 75 s | For 12 s: grow 30%, +60% → 100% ATK, immune to crowd control, basic attacks cleave 180°, and every 4th hit sends a 4 m shockwave for 200% ATK |

### Monk (unlocked by Boss 1)

Combo fighter who stores Spirit Orbs and dumps them into a huge finisher. Main stats STR and AGI; the finisher also wants INT. Affinity: knuckle. Nods to Ragnarok's Monk.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Palm Strike | Active · enemy | STR 5 | 8 · 4 s | 160% → 280% ATK and a 2 m knockback. +1 orb |
| 1 | Spirit Orbs | Passive | AGI 5 | — | Basic attacks have a 20% → 40% chance to make a Spirit Orb (up to 5). +2% → 4% ATK per orb held |
| 2 | Flowing Combo | Active · enemy | STR 20, AGI 15 | 14 · 5 s | 3 hits of 90% → 150% ATK. +1 orb. +30% damage if used within 1.5 s of Palm Strike or a Triple Blow |
| 2 | Triple Blow | Passive · trigger | AGI 20 | — | Basic attacks have a 10% → 25% chance to strike 3 times (100% → 140% ATK each) |
| 3 | Orb Barrage | Active · enemy (projectiles) | STR 40 | 15 · 6 s | Fire every orb held as a homing projectile, 120% → 200% ATK each |
| 3 | Iron Skin | Active · self | VIT 30, STR 30 | 25 · 25 s | For 6 → 10 s: +50% → 100% DEF and MDEF and immune to knockback, but −25% move speed |
| 4 | Ascending Fist | Active · around self (3 m) | STR 60, AGI 30 | 35 · 12 s | Uppercut for 300% → 500% ATK and a 1 s stun. Spends up to 3 orbs for +40% each |
| 5 | Heavenfall Fist | Ultimate · enemy | STR 80, INT 40 | All SP (at least 40) · 45 s, cast 0.8 s | 800% ATK plus 8 × SP spent (that bonus capped at 4,000 → 7,000), and +20% per orb spent (spends all). SP regen stops for 5 s. Casts instantly right after Flowing Combo |

### Paladin (unlocked by Boss 2)

Holy tank whose aura also protects summons; its big skills mix ATK and MATK. Main stats VIT and STR, with some INT. Affinity: sword, mace; shields add bonuses. Nods to Ragnarok's Crusader and Paladin.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Smite Rush | Active · enemy (dash, 6 m) | VIT 10 | 12 · 7 s | Dash in for 150% → 260% ATK and a 1 → 2 s stun. +30% with a shield |
| 1 | Aegis Training | Passive | VIT 10 | — | +3% → 15% block chance (blocked hits deal 50%). With a shield, blocks also reflect 10% → 30% of the hit |
| 2 | Crusader's Cross | Active · cone (X-slash, 3 m) | STR 20, INT 10 | 15 · 6 s | 2 hits of 130% → 220% ATK holy. 10% → 30% chance to blind for 3 s |
| 2 | Guardian Aura | Toggle · aura (5 m) | VIT 25 | 1 SP per second | You and your summons take 5% → 15% less damage and regenerate 0.5% Max HP per second |
| 3 | Ricochet Shield | Active · enemy (bouncing projectile) | VIT 40, STR 20 | 20 · 8 s | Bounces between 3 → 5 enemies for 160% → 260% ATK plus half your DEF each |
| 3 | Reprisal | Passive · trigger | VIT 40, INT 15 | — | When you block, or take a hit over 10% of Max HP: a 3 m holy pulse for 80% → 160% ATK + 50% MATK. Cooldown 3 s |
| 4 | Dawnbreaker Cross | Active · around self (cross, 4 m arms) | VIT 60, INT 30 | 45, plus 10% of current HP · 16 s | 3 hits of (ATK + MATK) × 100% → 160% holy. Undead and Demons take 1.5× |
| 5 | Bastion of Light | Ultimate · self | VIT 80, STR 40 | 80 · 80 s | For 8 s: 60% less damage taken, taunt everything within 8 m, and reflect 30% → 60% of damage taken as holy damage. Heal 30% Max HP when it ends |

### Necromancer (unlocked by Boss 2)

Summoner who drains life and blows up corpses. Main stats INT and LUK. Affinity: staff, dagger.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Soul Siphon | Active · enemy (projectile) | INT 5 | 10 · 4 s, cast 0.5 s | 140% → 240% MATK shadow. Heals you for 30% of the damage dealt |
| 1 | Bone Servant | Active · summon | INT 10 | 18 · 10 s | Raise a skeleton for 30 s (1 → 3 alive at once) with 30% of your Max HP. It hits for 40% → 70% MATK shadow |
| 2 | Hex | Active · ground (4 m) | INT 20, LUK 10 | 16 · 10 s | Curse enemies for 8 s: −15% → −35% ATK and −20% move speed. Cursed enemies take +10% → 20% damage from summons |
| 2 | Grave Pact | Passive | INT 20 | — | Summons get +10% → 40% damage and Max HP. One more skeleton is allowed at r3 and again at r5 |
| 3 | Carrion Blast | Active · ground | INT 40, LUK 20 | 25 · 6 s | Detonate up to 3 → 5 corpses (dead enemies leave one for 6 s), or 1 of your summons if there are none: 150% → 260% MATK shadow in 3 m each |
| 3 | Last Rites | Passive · trigger | INT 40 | — | When a summon dies, it explodes for 80% → 160% MATK in 2.5 m and heals you for 3% Max HP |
| 4 | Ossuary Titan | Active · summon | INT 60, LUK 30 | 50 · 45 s | A bone golem for 45 s (1 at a time) with 80% of your Max HP. It taunts and slams for 120% → 200% MATK in 3 m |
| 5 | Legion of Bones | Ultimate · summon | INT 80, LUK 40 | 100 · 90 s | Raise 5 → 7 spectral warriors for 15 s (60% → 90% MATK per hit). While any live, you take 20% less damage. They count toward the 8-summon cap, and the oldest summons are dismissed to make room |

### Ninja (unlocked by Boss 3)

Mobile skirmisher mixing physical tricks with fire and lightning jutsu. Main stats AGI and DEX, with some INT. Affinity: dagger. Nods to Ragnarok's Ninja.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Shuriken Toss | Active · enemy (30° fan of projectiles) | DEX 5 | 8 · 3 s | 3 → 5 shuriken of 80% → 130% ATK, each piercing 1 enemy |
| 1 | Shadow Dash | Active · direction (6 m) | AGI 10 | 8 · 6 → 4 s | Dash with 0.3 s of invulnerability. Smoke at the start point blinds enemies for 2 s. At r5, 2 charges |
| 2 | Flame Jutsu | Active · cone (60°, 6 m) | INT 20, DEX 15 | 18 · 8 s, cast 0.4 s | 160% → 280% MATK fire and burn for 3 s |
| 2 | Cicada Escape | Passive · trigger | AGI 20 | — | When a hit would deal over 15% of Max HP, a 15% → 35% chance to take no damage and blink 3 m back. Cooldown 8 s |
| 3 | Shade Double | Active · summon | AGI 40, DEX 20 | 25 · 20 s | A shadow copy of you for 12 s that repeats your basic attacks at 40% → 70% damage |
| 3 | Lethal Focus | Passive | AGI 40 | — | +5% → 15% crit chance. Crits on enemies above 80% HP deal +30% → 60% |
| 4 | Thunder Seal | Active · ground (5 m) | DEX 60, INT 30 | 40 · 16 s | After 1 s, 4 lightning strikes of 120% → 200% MATK wind, each stunning for 0.5 s |
| 5 | Shadow Tempest | Ultimate · around self (8 m) | AGI 80, DEX 40 | 80 · 60 s | Vanish (invulnerable) and strike every enemy within 8 m: 8 hits over 2 s, 150% → 220% ATK each, all crits. Reappear where you started |

### Gunslinger (unlocked by Boss 3)

Long-range burst built on Coins earned from crits. Main stats DEX and LUK. Affinity: gun. Nods to Ragnarok's Gunslinger.

| Tier | Skill | Type | Needs | SP · cooldown | Effect (r1 → r5) |
| --- | --- | --- | --- | --- | --- |
| 1 | Rapid Shot | Active · enemy | DEX 5 | 8 · 3 s | 5 bullets of 50% → 85% ATK |
| 1 | Lucky Coin | Passive | LUK 5 | — | Crits and every 5th basic attack give 1 Coin (up to 5 → 10). +1% ATK per Coin held |
| 2 | Bullet Waltz | Active · around self (4 m) | DEX 20, LUK 10 | 18 · 8 s | Spin and fire for 1 s: 10 hits of 40% → 70% ATK. One enemy takes at most 4 |
| 2 | Marksman's Round | Active · direction | DEX 25 | 20 · 10 s, aim 0.8 s | 350% → 600% ATK, ignoring 30% DEF. Spends up to 3 Coins for +25% each |
| 3 | Hair Trigger | Active · self | DEX 40 | 30 · 25 s | For 8 → 12 s: +50% → 100% APS and gun basic attacks pierce, but −30% move speed |
| 3 | Steady Sight | Passive | DEX 40, LUK 20 | — | +5% → 25% crit damage and +5 → 25 HIT. Ranged basic attacks on targets 8 m or more away deal +10% → 20% |
| 4 | Scatter Mines | Active · ground | DEX 60, LUK 25 | 35 · 12 s | Fire 3 rounds that become mines (up to 6, each lasts 20 s). Each explodes on contact for 180% → 300% ATK fire in 2.5 m |
| 5 | Last Stand Barrage | Ultimate · cone (60°, 10 m) | DEX 80, LUK 40 | 80 · 50 s | 900% → 1,400% ATK plus 100% per Coin spent (spends all). You're knocked back 4 m and slowed 50% for 3 s |

### Example hybrid builds

The simulator must test these five (Section 13). Stats are at level 80, which gives 885 points.

| Build | Stats at level 80 (points used) | Six actives | Four passives | Why it works |
| --- | --- | --- | --- | --- |
| Lich Saint (Necromancer + Priest) | INT 85, LUK 40, VIT 40, DEX 30, AGI 20 (883) | Bone Servant, Ossuary Titan, Legion of Bones, Carrion Blast, Heal, Hallowed Ground | Grave Pact, Last Rites, Second Wind, Divine Favor | Both trees run on INT, so one stat reaches both top tiers. Heal and Hallowed Ground keep the army alive |
| Crusader of Rage (Paladin + Berserker) | STR 80, VIT 60, INT 30, AGI 30, DEX 10 (884) | Smite Rush, Berserk, Crusader's Cross, Reaper's Spin, Dawnbreaker Cross, Avatar of Wrath | Bloodlust, Blood Drinker, Reprisal, Aegis Training | Low HP feeds Bloodlust while lifesteal, blocks and Reprisal keep you standing |
| Spellblade Shinobi (Mage + Ninja) | INT 70, DEX 60, AGI 50, VIT 20, LUK 15 (878) | Shadow Dash, Ember Bolt, Flame Jutsu, Chain Lightning, Thunder Seal, Glacial Storm | Spell Focus, Arcane Mind, Cicada Escape, Lethal Focus | DEX powers both cast speed and ninjutsu, and dashes keep a fragile caster alive. Three main stats leave no room for an ultimate at level 80 |
| Bullet Fist (Monk + Gunslinger) | STR 70, DEX 50, AGI 40, LUK 30, VIT 35 (867) | Palm Strike, Flowing Combo, Ascending Fist, Rapid Shot, Bullet Waltz, Marksman's Round | Triple Blow, Spirit Orbs, Lucky Coin, Steady Sight | With knuckles, gun skills use melee ATK (STR) and fire spectral bullets, without the affinity bonus. LUK feeds Coins |
| Treasure Hunter (Merchant + Thief) | LUK 70, AGI 50, STR 50, VIT 30, DEX 20 (863) | Coin Smash, Wagon Wheel, Hired Guard, Knife Flurry, Umbral Step, Viper Fang | Pickpocket, Lucky Find, Haggle, Twin Strike | A farming build: more loot and gold per kill, paid for with weaker boss damage |

## 10. Combat rules

Every hit runs one pipeline: hit check, base damage, skill multiplier, bonuses, element, defense, then crit and variance.

### Damage pipeline

1. **Hit check.** Physical attacks roll 80 + HIT − FLEE (15–100%). Crits and magic always hit. The defender then rolls perfect dodge against physical hits.
2. **Base.** Physical uses ATK. Magic uses MATK, rolled between its minimum and maximum.
3. **Skill multiplier.** For example 250% ATK. A matching weapon affinity adds +25%.
4. **Bonuses.** All +% damage bonuses from passives, cards and buffs that match the skill's tags add into one group. Race bonuses from cards add into a second. Target modifiers (mark, Hex, stagger) form a third. The three groups multiply.
5. **Element.** Multiply by the element table below.
6. **Defense.** Multiply by 100 / (100 + DEF) for physical or 100 / (100 + MDEF) for magic, after any ignore-DEF effect.
7. **Crit.** Physical crits multiply by 1.5 plus crit damage bonuses. Magic can't crit unless a skill says so.
8. **Variance.** Multiply by 0.95–1.05, round, minimum 1.

```latex
\text{damage} = \text{base} \times \text{skill\%} \times (1 + \textstyle\sum \text{tag bonuses}) \times (1 + \text{race bonus}) \times \text{target mods} \times \text{element} \times \frac{100}{100 + \text{DEF}} \times \text{crit} \times \text{variance}
```

### Elements

Rows are the attack's element and columns the defender's. Each monster has one element. The hero has none, so monster attacks deal ×1 to the hero except where gear adds resistances.

| Attack ↓ / defender → | Neutral | Fire | Water | Wind | Earth | Poison | Holy | Shadow | Ghost | Undead |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Neutral | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0.25 | 1 |
| Fire | 1 | 0.25 | 0.5 | 1 | 1.5 | 1 | 1 | 1 | 0.75 | 1.25 |
| Water | 1 | 1.5 | 0.25 | 0.5 | 1 | 1 | 1 | 1 | 0.75 | 1 |
| Wind | 1 | 1 | 1.5 | 0.25 | 0.5 | 1 | 1 | 1 | 0.75 | 1 |
| Earth | 1 | 0.5 | 1 | 1.5 | 0.25 | 1 | 1 | 1 | 0.75 | 1 |
| Poison | 1 | 1 | 1 | 1 | 1 | 0 | 0.75 | 0.5 | 0.5 | 0.5 |
| Holy | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1.5 | 1.25 | 1.75 |
| Shadow | 1 | 1 | 1 | 1 | 1 | 0.5 | 1.5 | 0 | 0.75 | 0.25 |
| Ghost | 0.25 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1.25 | 1 |
| Undead | 1 | 1 | 1 | 1 | 1 | 0.5 | 1.25 | 0 | 1 | 0 |

The cycle to remember: water beats fire, fire beats earth, earth beats wind, and wind (lightning) beats water. Holy crushes Undead and Shadow, and Neutral barely touches Ghosts.

### Monster races

Formless, Undead, Brute, Plant, Insect, Demon, Humanoid and Dragon. Cards and passives add damage against a race, for example +10% against Brutes.

### Status effects

| Status | Effect | Typical duration | On bosses |
| --- | --- | --- | --- |
| Stun | Can't move or act | 1–2 s | Fills the stagger bar instead |
| Freeze | Can't move or act. The next physical hit deals +30% and breaks it | 2 s | Fills the stagger bar instead |
| Root | Can't move, can still act | 3–5 s | Fills the stagger bar instead |
| Slow | −30% move speed and −20% APS, unless the skill says otherwise | 3 s | Works |
| Burn | Fire damage over time, scaled from the caster | 3–5 s | Works |
| Poison | Damage over time and −30% healing received | 5 s | Works |
| Bleed | Physical damage over time, stacking to 3 | 4 s | Works |
| Blind | −50% HIT. On the hero, the screen edges darken | 3 s | Works |
| Silence | Can't use skills | 2 s | Immune |
| Curse | −20% ATK and MATK and −20% move speed, unless the skill says otherwise | 6–8 s | Works |
| Mark | Takes more damage from all sources; the skill sets how much | 6 s | Works |
| Taunt | Must target the taunter | 4 s | 2 s at most |

### Enemy AI archetypes

| Archetype | Behavior | Examples |
| --- | --- | --- |
| Chaser | Aggros at 10 m, chases and attacks in melee range. Leashes 30 m from its spawn and resets | Jellop, Rattlebone, Snow Wolf |
| Kiter | Keeps 6–9 m away and shoots. Backs off when the hero is within 3 m | Bone Archer, Cactling |
| Caster | Drops a telegraphed area on the hero's position (0.8–1.2 s warning) | Capshroom, Frost Imp |
| Charger | Shows a line telegraph, then dashes along it | Dust Devil, Flame Salamander |
| Swarmer | Weak and fast, in packs of 3–6 | Grave Bat, Cinder Hound |
| Burrower | Hides, then erupts under the hero (circle telegraph) | Rootmole, Sandworm Larva |
| Exploder | Runs in, shows a 0.8 s circle and explodes | Plague Rat |
| Support | Heals or buffs nearby monsters and keeps its distance | Hex Witch |
| Splitter | Splits into 2 smaller copies on death | Chaos Spawn |

- **Threat:** monsters target the hero or a summon by threat. Damage dealt adds threat, a taunt sets top threat for its duration, and the first hit sets the starting threat.
- **Telegraphs:** every enemy attack that can deal more than 15% of the hero's Max HP shows a ground shape (circle, cone, line, donut or cross) that fills up to show its timing. Warnings last at least 0.6 s for normal monsters and 0.8–1.8 s for bosses. Red means damage, purple a debuff and blue a freeze. Outlines and fill patterns differ too, so color is never the only cue.

### Basic attacks by weapon

| Weapon | APS | Range | ATK formula | Basic attack | Hands |
| --- | --- | --- | --- | --- | --- |
| Sword | 1.25 | 2.2 m | Melee | One hit | One |
| Greataxe | 0.85 | 2.6 m | Melee | Hits everything in a 100° arc | Two |
| Dagger | 1.7 | 1.8 m | Melee | One hit | One |
| Mace | 1.1 | 2.0 m | Melee | One hit; maces also carry some MATK | One |
| Knuckle | 1.8 | 1.6 m | Melee | One hit | Two |
| Staff | 0.9 | 8 m | Magic | A bolt for 80% MATK, neutral | Two |
| Bow | 1.0 | 10 m | Bow and gun | An arrow | Two |
| Gun | 1.15 | 11 m | Bow and gun | A fast bullet | Two |

One-handed weapons take an off-hand: a Shield (DEF and a 5% block chance) or a Tome (MATK and Max SP).

### Death

The run ends. You keep all of its EXP and loot and return to town. A Phoenix Feather revives you once per run at 50% HP. In Nightmare, death costs 1% of the current level's EXP but never a level.

## 11. Zones, monsters & bosses

Six zones run from level 1 to 85. Each has one open field with six monster types, an elite and a boss. Levels 85–99 come from the Endless Tower and Nightmare.

### Zones at a glance

| # | Zone | Levels | Theme and element | Boss (level) | First kill unlocks (plus 2 skill points) |
| --- | --- | --- | --- | --- | --- |
| 1 | Meadowmere Fields | 1–12 | Meadow; Earth and Neutral | Queen Gelatina (12) | Berserker and Monk trainers, 5th active slot, Zone 2 |
| 2 | Hollowbone Catacombs | 12–25 | Crypt; Undead and Shadow | The Hollow Abbot (25) | Paladin and Necromancer trainers, 6th active slot, Zone 3 |
| 3 | Sunscar Dunes | 25–40 | Desert; Earth and Wind | Gilded Scarab Rex (40) | Ninja and Gunslinger trainers, 3rd passive slot, Endless Tower, Zone 4 |
| 4 | Frostfang Peaks | 40–55 | Snow; Water | Rimeclaw, the Glacial Wyrm (55) | 4th passive slot, Zone 5 |
| 5 | Emberforge Caldera | 55–70 | Volcano; Fire | Ignar, the Forge Tyrant (70) | Refining to +8, +9 and +10, preset slot 2, Zone 6 |
| 6 | Abyssal Spire | 70–85 | Demon citadel; Shadow | Malgrath, the Horned Sovereign (85) | Nightmare difficulty, preset slot 3, Circlet of the Polymath |

### Field rules

- Each field is about 80 × 80 m with obstacles and props. Ten spawn points each keep a pack of 2–5 monsters, respawning 10 s after the pack dies. At most 30 monsters are alive.
- Monster levels climb from the zone's minimum at the entrance to its maximum at the far side.
- An elite spawns about every 150 s at a far spawn point and gets an off-screen arrow.
- The boss gauge works as in Section 3. The boss fights in its own circular arena, 15 m in radius, with only its adds.
- Field layouts can be generated once from a fixed seed per zone, then saved as JSON and tuned by hand.

Card drop rates are in Section 12.

### Zone 1: Meadowmere Fields (levels 1–12)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Jellop | Chaser | Formless · Neutral | Hop-bump | Armor: +3% Max HP, +1 LUK |
| Hopbun | Chaser (fast) | Brute · Earth | Double kick | Shoes: +4% move speed, +1 AGI |
| Buzzwing | Kiter | Insect · Wind | Poison sting | Weapon: 5% chance to poison on hit |
| Capshroom | Caster | Plant · Earth | Spore cloud (circle, poison) | Garment: +15% poison resist, +1 VIT |
| Thornling | Chaser (tanky) | Plant · Earth | Thorn slap; reflects 5% of melee damage | Armor: reflect 3% of melee damage taken |
| Rootmole | Burrower | Brute · Earth | Erupts under the hero | Accessory: +2 STR |
| Thorn Guardian (elite) | Elite | Plant · Earth | Root vines (line, roots 1.5 s) | Weapon: +10% damage against Plants |
| Queen Gelatina (boss) | Boss | Formless · Neutral | See below | Accessory: +10% Max HP, heal 1% Max HP per kill |

### Zone 2: Hollowbone Catacombs (levels 12–25)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Rattlebone | Chaser | Undead · Undead | Shield bash | Weapon: +12% damage against Undead |
| Bone Archer | Kiter | Undead · Undead | 3-arrow volley | Weapon: +5 HIT, +8% ranged damage |
| Wisp | Caster | Formless · Ghost | Hex bolt. Neutral attacks barely hurt it (×0.25) | Garment: +15% shadow and ghost resist |
| Ghoul | Chaser | Undead · Undead | Poison claw | Head: immune to poison |
| Grave Bat | Swarmer | Brute · Shadow | Dive bite | Weapon: 2% lifesteal |
| Plague Rat | Exploder | Brute · Poison | Poison burst | Shoes: +10 FLEE |
| Bone Knight (elite) | Elite | Undead · Undead | Charge; blocks hits from the front | Shield: +5% block chance |
| The Hollow Abbot (boss) | Boss | Undead · Undead | See below | Head: +15% holy and shadow damage |

### Zone 3: Sunscar Dunes (levels 25–40)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Sand Scorpion | Chaser | Insect · Earth | Poison tail sting | Weapon: +10% damage against Insects |
| Dune Mummy | Chaser (slow, tanky) | Undead · Undead | Cursing grasp | Armor: +20% shadow resist |
| Cactling | Kiter | Plant · Earth | 5-needle fan | Garment: reflect 5% of ranged damage taken |
| Dust Devil | Charger | Formless · Wind | Whirling dash that pulls | Shoes: +6% move speed, +1 AGI |
| Sandworm Larva | Burrower | Insect · Earth | Erupts and knocks up | Armor: +6% Max HP, +4 DEF |
| Desert Raider | Chaser (dash) | Humanoid · Neutral | Lunging slash | Weapon: +10% damage against Humanoids |
| Tomb Sentinel (elite) | Elite | Formless · Earth | Ground pound (donut) | Armor: −8% damage taken from bosses |
| Gilded Scarab Rex (boss) | Boss | Insect · Earth | See below | Shield: reflect 20% of magic damage taken |

### Zone 4: Frostfang Peaks (levels 40–55)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Snow Wolf | Swarmer (packs of 3) | Brute · Water | Pounce | Weapon: +10% damage against Brutes |
| Frost Imp | Caster | Demon · Water | Ice bolt that slows | Weapon: +8% water skill damage |
| Yeti Cub | Chaser (tanky) | Brute · Water | Belly slam (circle) | Armor: +2 VIT, +10% freeze resist |
| Ice Golem | Chaser (slow, high DEF) | Formless · Water | Shatter stomp | Shield: +12 DEF |
| Glacier Owl | Kiter (flying) | Brute · Wind | Dive (line) | Head: +3 DEX |
| Frost Wraith | Caster | Formless · Ghost | Freezing circle | Garment: +30% freeze resist |
| Avalanche Yeti (elite) | Elite | Brute · Water | Rolling snowball (line) | Accessory: +3 STR, +3 VIT |
| Rimeclaw (boss) | Boss | Dragon · Water | See below | Garment: immune to freeze, +10% damage against Dragons |

### Zone 5: Emberforge Caldera (levels 55–70)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Magma Slug | Chaser (slow) | Insect · Fire | Leaves a burning trail | Armor: +15% fire resist |
| Fire Imp | Caster | Demon · Fire | Fireball (circle) | Weapon: +8% fire skill damage |
| Cinder Hound | Swarmer | Brute · Fire | Flaming bite | Shoes: +2 AGI, +4% APS |
| Obsidian Golem | Chaser (high DEF) | Formless · Earth | Obsidian slam | Weapon: +10% damage against Formless |
| Flame Salamander | Charger | Dragon · Fire | Fire breath (cone) | Weapon: +10% damage against Dragons |
| Forge Automaton | Kiter | Formless · Neutral | Mortar shell (circle) | Accessory: +5% refine success chance |
| Molten Colossus (elite) | Elite | Formless · Fire | Lava trail, magma fist | Armor: +12% Max HP |
| Ignar (boss) | Boss | Humanoid · Fire | See below | Weapon: basic attacks have a 5% chance to cast a 3 m fire nova (150% ATK) |

### Zone 6: Abyssal Spire (levels 70–85)

| Monster | Type | Race · element | Signature move | Card: slot and effect |
| --- | --- | --- | --- | --- |
| Shade Knight | Chaser (armored) | Humanoid · Shadow | Shadow cleave (cone) | Armor: +2 STR, +2 VIT, +5 DEF |
| Abyss Eye | Caster (floating) | Demon · Shadow | Beam (line) | Head: +4 INT, +5% MATK |
| Void Hound | Swarmer (blinks) | Demon · Shadow | Blink bite | Weapon: +10% damage against Demons |
| Hex Witch | Support | Humanoid · Shadow | Curses the hero, buffs allies | Garment: +20% curse and silence resist, +2 INT |
| Gargoyle | Kiter (flying) | Demon · Earth | Dive; turns to stone for 2 s (immune) | Shield: +8 DEF, +8 MDEF |
| Chaos Spawn | Splitter | Formless · Poison | Splits in two on death | Accessory: +1 to all stats |
| Dread Champion (elite) | Elite | Demon · Shadow | Dash combo and cleave | Weapon: +8% crit chance, +10% crit damage |
| Malgrath (boss) | Boss | Demon · Shadow | See below | Accessory: +10% damage, +5% cooldown reduction |

### Bosses

Boss HP is a multiple of a normal monster's HP at the boss's level. Every boss shows a name card, has a phase-marked HP bar and a stagger bar, and drops a chest (Section 12).

#### Queen Gelatina, level 12

Formless · Neutral. HP 70×. Enrage at 4:00: +40% speed and double slams.

- **Bounce Slam:** leaps onto the hero's spot (circle 3.5 m, 1.2 s warning) for 180% ATK and a knockback.
- **Jelly Spit:** 3 globs in a fan that slow by 30% for 2 s.
- **Royal Roll:** rolls across the arena (line 20 × 3 m, 1.0 s warning) for 220% ATK.
- **Split** (at 66% and 33% HP): 4 Jellops crawl toward her, and each one that reaches her heals her 4%.
- Teaches: kill adds fast; area damage pays off.
- Unique drops (3% each): Royal Jelly Crown (head: +5% Max HP, +2 VIT, heal 2% Max HP per kill) and Wobbling Scepter (staff: spells have a 10% chance to cast twice at 50% power).

#### The Hollow Abbot, level 25

Undead · Undead. HP 80×. Enrage at 5:00.

- **Soul Lanterns:** 3 lanterns orbit him and sweep rotating beams, with a 1.0 s warning before each sweep. Lanterns can be destroyed, and breaking all 3 staggers him for 4 s.
- **Grave Call:** summons 4–6 Rattlebones every 25 s.
- **Hex Pools:** 3 dark pools drop on the hero one after another (circle 2.5 m, 0.9 s warning) and leave curse zones for 6 s.
- **Below 50%:** darkness limits vision to 9 m around the hero. He teleports every 12 s and casts Requiem, a donut that is safe within 3 m of him and hits from 3 to 10 m (1.5 s warning).
- Weak to holy (×1.75) and fire (×1.25). Teaches: splash in Priest or Paladin skills.
- Unique drops: Abbot's Lantern (tome: +20% holy and shadow damage, +1 skeleton allowed) and Requiem Plate (armor: 10% less damage taken per active summon, up to 30%).

#### Gilded Scarab Rex, level 40

Insect · Earth. HP 90×. Enrage at 5:00.

- **Burrow:** dives underground. A rumble marker follows the hero for 2 s, locks in place and erupts 1.0 s later (circle 3 m, 250% ATK).
- **Sand Spray:** cone 90°, 8 m, 1.0 s warning. Blinds for 3 s.
- **Golden Carapace:** every 30 s, for 6 s, a gold shell makes it immune to magic and reflects 50% of magic damage back at the caster, while physical damage deals +25%. A banner warns when it starts.
- **Scarab Swarm:** 6 fast Scarablings.
- **Below 40%:** a sandstorm shrinks the safe circle to 12 m. Outside it, the hero loses 5% Max HP per second.
- Weak to fire (×1.5). Teaches: carry both physical and magic damage.
- Unique drops: Scarab Carapace (shield: reflect 15% of magic damage taken) and Sandstorm Repeater (gun: basic attacks have a 20% chance to fire 3 bullets).

#### Rimeclaw, the Glacial Wyrm, level 55

Dragon · Water. HP 100×. Enrage at 6:00.

- **Frost Breath:** cone 60°, 12 m, 1.3 s warning. 300% ATK and a 1.5 s freeze.
- **Icicle Rain:** 10 small circles (1.5 m) around the hero, 0.9 s warning.
- **Tail Sweep:** a 180° rear arc when the hero is behind it, 0.8 s warning, with a knockback.
- **Below 50%:** takes off (untargetable for 6 s) for 3 strafing dives (lines 25 × 4 m, 1.2 s warning), then lands with a frost nova (donut). Frost patches on the ground slow by 40%.
- Weak to wind (×1.5). Teaches: mobility and freeze resist.
- Unique drops: Rimeclaw Fang (dagger: water element, 5% freeze chance on hit) and Frostwing Cloak (garment: +10% move speed, immune to freeze).

#### Ignar, the Forge Tyrant, level 70

Humanoid · Fire. HP 110× and DEF 2×. Enrage at 6:00.

- **Hammer Quake:** 3 shockwave rings in sequence (donuts, 0.8 s apart). Stand between the rings.
- **Molten Spread:** lava pools appear and stay until the next phase, shrinking the arena.
- **Forge Imps:** 4 Fire Imps every 30 s.
- **Heat:** +5% ATK every 20 s, stacking. Any water hit removes 1 stack.
- **Below 25%:** meteor rain (a new circle every 0.7 s) plus hammer combos.
- Weak to water (×1.5). Teaches: magic and element swaps against high DEF.
- Unique drops: Tyrant's Maul (greataxe: basic attacks send a 3 m shockwave) and Forgeheart Ring (accessory: +1 refine level on all equipped gear, up to +10).

#### Malgrath, the Horned Sovereign, level 85

Demon · Shadow. HP 130×. Enrage at 7:00: +100% damage.

- **Phase 1:** Scythe Sweep (cone 120°, 7 m, 1.0 s warning); Dark Orbs (3 slow homing orbs that explode in 2.5 m on contact or after 6 s); Blink Strike (teleports behind the hero, circle 3 m, 0.8 s warning).
- **Below 66%:** 2 Horn Totems rise. While either stands, he takes 50% less damage and the totems pulse damage. Break them.
- **Below 33%:** Mirror of Malice every 15 s, a shadow copy of the hero that appears for 4 s and casts the hero's most-used skill at 50% damage. Abyssal Rift telegraphs half the arena (1.8 s warning).
- Weak to holy (×1.5).
- Unique drops: Circlet of the Polymath (head: −10% skill stat requirements, rounded up; guaranteed on the first kill) and Sovereign's Signet (accessory: +15% damage to bosses, +10% cooldown reduction).

### Endless Tower (after Boss 3)

- Floors are small arenas. Clear every monster to open the next floor.
- Monster level is 30 + floor number, up to 99. Past floor 69, monsters also gain +4% HP and ATK per floor, compounding.
- Every 5th floor adds an elite. Every 10th floor is a boss: Bosses 1–6 in rotation, scaled to the floor, with 1 random affix (2 from floor 60).
- Affixes: Hasted (+30% speed), Vampiric (heals 5% of damage dealt), Shielded (a shield every 20 s), Splitting (adds at 75%, 50% and 25% HP), Reflective (reflects 20% of damage), Volatile (explodes on death) and Frenzied (enrages at 50% HP).
- Checkpoints every 10 floors. A run can start from any checkpoint already reached.
- Each floor gives Tower Tokens: the floor number ÷ 5, rounded down, + 1, and 5× that on boss floors. The Token shop sells Starmetal, Blessed Hammers, Oblivion Draughts, Boss Sigils, Phoenix Feathers and Field Manuals.
- Auto-battle works except on boss floors. The best floor is saved.
- v1 defines floors 1–100 by formula, and floors beyond keep scaling.

### Nightmare (after Boss 6)

Every zone returns with monsters 25 levels higher (up to 99), 2.5× HP, 2× ATK, 2.5× EXP and 2× gold. Items have a 20% chance to drop one rarity higher, and each boss gains 1 Tower affix. Death costs 1% of the current level's EXP.

## 12. Loot, gear & economy

Gear works the Ragnarok way: fixed base items in six tiers, with rarity, random card slots and refining doing the chasing.

### Equipment slots

Weapon, off-hand (shield or tome; empty with a two-handed weapon), head, armor, garment, shoes and two accessories: 8 slots. Only the weapon, off-hand and head show on the model.

### Item tiers

Generate `items.json` from these templates with a script; write the legendaries by hand. Names are the tier prefix plus the item type, for example "Frostforged Staff".

| Tier | Level | Weapon ATK (MATK for staves) | Body armor DEF | Prefix | Drops in |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 12 | 6 | Worn | Zone 1 |
| 2 | 12 | 35 | 14 | Bonecarved | Zone 2 |
| 3 | 25 | 65 | 24 | Sunsteel | Zone 3 |
| 4 | 40 | 100 | 36 | Frostforged | Zone 4 |
| 5 | 55 | 140 | 50 | Emberforged | Zone 5 |
| 6 | 70 | 185 | 66 | Voidforged | Zone 6 and Tower floors 40+ |

- **Weapon ATK multipliers:** sword 1.0, greataxe 1.35, dagger 0.75, mace 0.9 (plus 30% of its ATK as MATK), knuckle 0.7, bow 0.95, gun 0.9. Staves have MATK at 1.0 and ATK at 0.3.
- **Off-hands:** shield, DEF at 60% of body armor. Tome, MATK at 40% of the tier's weapon value and +4% Max SP per tier.
- **Head:** helm (DEF 50%) or hat (MDEF 50%, DEF 25%).
- **Armor:** plate (DEF 100%), leather (DEF 70%, +2 FLEE per tier) or robe (DEF 40%, MDEF 60%, +3% Max SP per tier).
- **Garment:** cloak (DEF 40%, MDEF 40%). **Shoes:** boots (DEF 40%, +1% move speed per tier).
- **Accessories:** six rings, one per stat, each +1 to that stat per tier.

### Rarity

| Rarity | Color | Base stats | Card slots | Bonus stats | Drop weight |
| --- | --- | --- | --- | --- | --- |
| Common | White | ×1.0 | 0–1 | — | 60 |
| Fine | Green | ×1.1 | 0–2 | — | 28 |
| Rare | Blue | ×1.25 | 1–3 | One random stat, +1 per tier | 10 |
| Epic | Purple | ×1.4 | 2–4 | Two random stats, +1 per tier each | 2 |
| Legendary | Orange | Fixed | Fixed | A unique effect | Bosses only |

Slot counts are capped by item type: weapons hold up to 4 cards, armor and off-hands up to 2, and head, garment, shoes and accessories 1. Bonus stats count toward skill requirements, so gear can open a hybrid's next skill.

### Drop rates

| Source | Equipment | Materials | Card | Other |
| --- | --- | --- | --- | --- |
| Normal monster | 4%, rarity by the weights above | 15% chance of the zone's ore | 0.25% | Gold; potions 5% |
| Elite | 1 item, Fine or better | 2–4 ore | 2% | Boss Sigil 25% |
| Boss chest | 2–3 items: at least 1 Rare or better, 25% chance of an Epic, 3% for each of its two legendaries | 5–8 ore | 5%, +0.5% for every kill without it until it drops | Oblivion Draught 10% |

LUK and loot passives multiply all of these chances, up to +100%.

### Cards

There are 48 cards: one per monster, elite and boss (tables in Section 11). Each fits one slot type. Socketing happens at the Blacksmith. Removing a card returns it and costs 1,000 × the item's tier in gold.

The Codex tracks found cards and pays milestone rewards: 10 cards give +1 to all stats, 20 give +5% gold, 30 give another +1 to all stats, 40 give +5% EXP, and all 48 give the title Card Master and +3% damage.

### Refining

| Refine | Success | Material |
| --- | --- | --- |
| +1 to +4 | 100% | Iron Shard |
| +5 | 80% | Mythril Shard |
| +6 | 65% | Mythril Shard |
| +7 | 50% | Mythril Shard |
| +8 (after Boss 5) | 35% | Starmetal |
| +9 | 25% | Starmetal |
| +10 | 15% | Starmetal |

- Each attempt costs 100 × item tier × (target refine level)² gold, plus 1 material.
- On failure, the gold and material are gone and the item drops one level. Items never break. A Blessed Hammer prevents the drop.
- Each level adds +6% base ATK and MATK to weapons, or +8% base DEF and MDEF to other gear. Items at +7 and above glow.
- Iron Shards drop in Zones 1–2, Mythril Shards in Zones 3–4, and Starmetal in Zones 5–6 and the Tower.

### Consumables

| Item | Effect | Price (gold) | Available |
| --- | --- | --- | --- |
| Minor Health Draught | Heal 20% Max HP | 30 | From the start |
| Greater Health Draught | Heal 35% Max HP | 150 | Level 25 |
| Grand Health Draught | Heal 50% Max HP | 500 | Level 50 |
| Mana Draught (three sizes) | Restore 20%, 35% or 50% Max SP | 40, 200, 650 | Same levels |
| Panacea | Remove all debuffs | 120 | Level 12 |
| Phoenix Feather | Revive once per run at 50% HP | Tower shop, boss chests | — |
| Boss Sigil | Open a zone's boss from the World Map | Elite drop, Tower shop | — |
| Oblivion Draught | Free stat reset | Boss chests, Tower shop | — |
| Field Manual | +50% EXP for 30 minutes | Tower shop | — |

Health draughts share an 8 s cooldown, and so do mana draughts.

### Inventory

- The bag starts at 60 slots and grows by 10 per expansion up to 120. Expansions cost 5k, 12k, 25k, 50k, 100k and 200k gold.
- Town storage holds 200. Materials, consumables and cards stack to 999.
- Drops fly to the hero on their own. If the bag is full, they go to an Overflow box (up to 50) to claim in town.
- A setting auto-sells Common items on pickup.

### Gold

- **Income:** 3 + 1.5 × monster level per kill (±20%), 8× for elites and 60× for bosses, plus item sales.
- **Sinks:** learning skills (472,800 gold to learn all 96), refining, stat resets, card removal, potions and bag expansions.

## 13. Progression & balance

Reaching level 99 should take about 20 hours of on-level grinding, and the simulator checks every fight against a time-to-kill target.

### EXP

```latex
\text{EXP to next level}(L) = (15 + 2L + 0.04L^2) \times \text{EXP}_{\text{monster}}(L)
```

```latex
\text{EXP}_{\text{monster}}(m) = 10 \times 1.06^{m} + 2m
```

- The first factor is how many same-level kills a level takes: 17 at level 1, 111 at level 30, 279 at level 60 and 595 at level 98.
- Level gap: EXP × clamp(1 + 0.05 × (monster level − hero level), 0.1, 1.5).
- Elites give 8× EXP and bosses 100× (200× on the first kill).
- Pace at about 20 kills per minute: level 1 to 30 in about 1.5 hours, 30 to 60 in 4.5 hours, 60 to 85 in 7.5 hours and 85 to 99 in about 6 hours. Elites, bosses, the Tower and Nightmare make it faster.

### Monster stats by level

| Stat | Formula (m = monster level) |
| --- | --- |
| HP | 20 + 8m + 0.12m² |
| ATK | 6 + 2.6m + 0.03m² |
| DEF | 5 + 0.6m |
| MDEF | 5 + 0.5m |
| HIT | 20 + 1.5m |
| FLEE | 10 + 1.2m |
| APS | 0.6–1.0, by archetype |
| Move speed | 3–6 m/s, by archetype |

Per-monster multipliers live in `monsters.json`; an Ice Golem might have DEF ×2, HP ×1.5 and speed ×0.6. Elites get HP ×8, ATK ×1.5, DEF ×1.3 and model scale ×1.4. Bosses use their own HP multiplier (Section 11) and per-attack damage.

### Time-to-kill targets

With on-level gear and a sensible build:

| Situation | Target |
| --- | --- |
| A normal monster | Dies to 3–4 basic attacks or 1 skill |
| A pack of 4 | Cleared in 4–6 s by an area build |
| An elite | 15–25 s |
| A boss on Normal | 2–3 minutes |
| A boss in Nightmare | 3–5 minutes |
| The hero against same-level normals | Survives 12–15 hits. A pack of 4 kills a hero who stands still in about 5 s |
| A boss's heavy hit | 25–35% of Max HP, never over 50% before enrage |
| Field pace | 15–25 kills per minute |

### Balance gates for the simulator

- Run 12 pure builds (one per class, using only that class's skills) and the 5 hybrid builds in Section 9.
- Every build must beat each zone's boss within 4 minutes at the boss's level, wearing on-level Fine gear.
- No build may clear fields more than 2× faster than the median build.
- To pass, tune `balance.json` and skill numbers rather than the formulas.

### Tuning knobs

Keep these in `balance.json`: stat point rules, HP and SP constants, ATK and MATK weights, APS coefficients, the cast-time divisor, every cap in Section 7, the DEF curve constant (100), the crit multiplier, monster curves, the EXP curve and level-gap rule, drop and card rates, gold per kill, refine rates and costs, respec cost, skill gold by tier, boss HP multipliers and Nightmare multipliers.

## 14. Screens & UX flows

The town is a menu hub, not a walkable map, so every system is at most two taps from the hub.

The main path runs Boot, Title, Create hero (first time only), Town hub, World Map, Field, Boss arena, Victory chest, Run results, and back to the Town hub.

### Screens

| Screen | What it shows | Main actions |
| --- | --- | --- |
| Boot | Logo, progress bar, a tip | — |
| Title | Continue, 3 hero slots, Settings, Credits, Export and Import save | Pick a slot |
| Create hero | 5 KayKit looks on a turntable, a name, a starter weapon (sword, staff, bow, dagger or mace), and 48 stat points with templates: Warrior (STR/VIT), Caster (INT/DEX), Rogue (AGI/LUK) or Custom | Confirm |
| Town hub | The hero idling on a small 3D diorama, with buttons for Adventure, Guild Hall, Status, Loadout, Inventory, Blacksmith, Shop, Oracle, Codex and Tower. Red badges flag unspent points, learnable skills and better items | Open a menu |
| Guild Hall | 12 trainer tabs; locked ones show how to unlock them. Each tree has 5 tier rows. A node shows icon, name, rank, requirements (green when met, red with numbers when not) and gold | Learn, rank up, reset ranks (free) |
| Skill detail | Full text, a rank table from r1 to r5, tags, affinity and requirement status | Learn, rank up, equip |
| Status | Six stats with + buttons and costs, free points, derived stats with pending changes, and the Unlocks list | Confirm, Undo |
| Loadout | 6 active, 4 passive and 2 consumable slots (locked ones show their unlock); learned skills filtered by class, tag or type; dormant skills greyed with the reason; preset tabs 1–3; the build title | Tap a skill, then a slot (or drag); save |
| Inventory | Paper doll with 8 slots, bag grid, tooltips that compare in green and red, sort, filter, lock and multi-sell | Equip, sell, lock, socket |
| Blacksmith | Refine tab: item, success chance, cost, Blessed Hammer toggle and result. Socket tab: item and card, with removal for a fee | Refine, socket, remove |
| Shop | Potions, Iron and Mythril Shards, bag expansions, and a Sell tab | Buy, sell |
| Oracle | Stat reset with its cost, or use an Oblivion Draught | Reset |
| Codex | Card grid (48, unknown ones as silhouettes) with milestones, and a bestiary with stats, element, race and drops after the first kill | Browse |
| World Map | 6 zones along a path plus the Tower. Each shows its level range, a boss-defeated mark, a Normal/Nightmare toggle and the Sigil count | Enter field, fight boss (with a Sigil), enter Tower |
| Field and boss HUD | See Section 5 | Play |
| Boss intro | A name card for 2 s, skippable | — |
| Victory chest | Rewards by rarity and any first-kill unlocks | Grind again, Town |
| Run results | Time, kills, EXP gained (and as % of a level), EXP per minute, gold, items by rarity, cards | Town |
| Pause | Resume, Settings, Leave run (keeps loot), Quit to title | — |
| Settings | Graphics preset, 30 or 60 fps cap, resolution scale, shadows, damage numbers (on, compact, off), screen shake, UI scale, left-handed mode, joystick type, auto-battle rules (potion at an HP %, which skills it may use), volumes, haptics, FPS counter, reset tips | — |
| Credits | Every asset and its license, from `CREDITS.md` | — |

### First-time hints

One-time coach marks instead of quests: the first move, first stat point, first learnable skill, first equip, first full boss gauge, first card and first death.

### Accessibility

- Text is at least 14 px at 100% UI scale.
- Telegraphs use shape and pattern as well as color.
- A reduce-motion option cuts screen shake and flashes.

## 15. Art, animation, VFX & audio

Everything visual comes from free CC0 low-poly packs plus effects made in code, so the build never needs an artist.

### Asset sources

| Pack | Used for | License | What's in it |
| --- | --- | --- | --- |
| [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | Hero looks, humanoid enemies, the Hired Guard | CC0 | 5 rigged characters in the free tier, 25+ weapons and accessories (swords, shields, axes, bow, crossbows, staff, wand), basic movement animations, FBX and glTF, one 1024 gradient atlas that can be downsampled to 128 |
| [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | Attacks, casting, shooting, dodges | CC0 | 133 humanoid animations (one- and two-handed, unarmed, dual-wield, block, bow and gun shooting, spellcasting, dodge), FBX and glTF, for KayKit's medium and large rigs |
| [KayKit Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) | Zone 2 skeletons, Bone Servant | CC0 | 4 rigged, animated skeletons (warrior, rogue, mage, sword-and-shield), FBX and glTF. The paid EXTRA tier adds a Skeleton Golem and a Necromancer, which would suit Ossuary Titan and the Hollow Abbot (optional) |
| [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | Most monsters and bosses | CC0 | 50 fully animated monsters, with glTF among the formats |
| [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) and other Kenney audio packs | Sound effects | CC0 (check each pack) | 50 RPG sounds: foley, footsteps, weapons |
| [game-icons.net](https://game-icons.net/about.html) | Skill, item and status icons (SVG) | CC BY 3.0: credit required, e.g. "Icons made by {author}. Available on https://game-icons.net" | About 4,000 game icons |
| An SIL Open Font License font, such as Fredoka | UI text, bundled locally for offline play | OFL | — |

Log every pack, version and license in `CREDITS.md`; the Credits screen reads it.

### Pipeline

- Convert every model to `.glb` and compress it with gltf-transform (meshopt plus texture resize) in a build script. Keep the original downloads out of `public/`.
- Load with GLTFLoader and MeshoptDecoder. Clone skinned meshes with SkeletonUtils.clone, give each animated entity one AnimationMixer, and share the animation clips.
- In M0, confirm that the Character Animations rig matches the Adventurers rig before relying on it.
- `modelMap.json` maps every hero look, monster, elite, boss and summon to a model file, scale, tint and animation names. Where no model fits (wolves, golems, scorpions, slugs and so on), reuse the closest one with a new tint and scale, or build a simple shape model in code. Log each substitution in `DECISIONS.md`.
- Bosses use a base model scaled 2.5–3.5×, a unique tint or emissive glow, and simple attachments made in code (a crown, a lantern, horns).
- Weapons attach to the hand bone, found by name at load time (the debug panel lists bone names). Guns and knuckles missing from the packs are built from simple shapes.
- Shading: toon or Lambert materials on the gradient atlas, one directional light plus a hemisphere light, and fog per zone for depth and draw distance.

### Hero look and class identity

- The body is the look picked at creation. The equipped weapon and off-hand show on the model.
- The build title (top two classes) shows on the Status screen and as a small banner over the hero in town.
- Optional cosmetic: an aura tint in the main class's color (a setting).
- Class colors for icons and effects: Knight steel blue, Mage violet, Archer leaf green, Priest gold, Thief teal, Merchant amber, Berserker crimson, Monk saffron, Paladin ivory, Necromancer sickly green, Ninja indigo, Gunslinger brass.

### Effects

- About 20 pooled templates made in code: projectile glow with trail, impact burst, ring shockwave, cone sweep, beam, ground decal, looping aura, shield bubble, buff sparkles, summon portal, explosion, meteor, lightning, poison cloud, fire wall segment, frost spikes, holy pillar, shadow tendrils, coin shower and loot beam.
- A skill picks a template plus an element color and a scale. Element colors: Neutral white, Fire orange, Water cyan, Wind pale yellow-green, Earth brown, Poison green, Holy gold, Shadow purple, Ghost pale blue, Undead grey-green.
- Particles are additive quads on instanced meshes. The Low preset halves particle counts.
- One telegraph shader draws circles, cones, lines, donuts and crosses, with a fill-progress value, an outline and a subtle pattern.
- Damage numbers draw on the 2D canvas overlay from a pool. They pop and float; crits are bigger and shake slightly.

### Audio

- Sound families: slash, blunt, arrow, gun, spell by element, heal, summon, monster hit and death by archetype, and UI (tap, equip, refine success and fail, card fanfare).
- Music: three loops (town, field, boss) from CC0 sources, or no music until polish (Section 19).
- Web Audio with a small mixer (master, music, effects), at most 24 sounds at once, and the hero's sounds take priority.

## 16. Data schemas & save format

All content is JSON, checked at load against these TypeScript types with a runtime validator (zod or similar). A bad file fails loudly in development and names the file and field.

Files in `src/data/`: `classes.json`, `skills.json`, `summons.json`, `monsters.json`, `bosses.json`, `zones.json`, `items.json`, `cards.json`, `balance.json`, `modelMap.json` and `strings.en.json`.

### Shared types, classes and skills

```ts
type Stat = "STR" | "AGI" | "VIT" | "INT" | "DEX" | "LUK";
type Element = "neutral" | "fire" | "water" | "wind" | "earth" | "poison" | "holy" | "shadow" | "ghost" | "undead";
type Race = "formless" | "undead" | "brute" | "plant" | "insect" | "demon" | "humanoid" | "dragon";
type WeaponType = "sword" | "greataxe" | "dagger" | "mace" | "knuckle" | "staff" | "bow" | "gun";
type StatusId = "stun" | "freeze" | "root" | "slow" | "burn" | "poison" | "bleed" | "blind" | "silence" | "curse" | "mark" | "taunt";
type Ranked = number | [first: number, last: number]; // rank-1 and max-rank values, linear in between

interface StatMod { stat: string; add?: Ranked; pct?: Ranked } // "STR", "maxHpPct", "damagePct", "aps", "castSpeed", "cdr", "dropRate"...

interface ClassDef {
  id: string;                          // "priest"
  name: string;
  color: string;                       // hex, for icons and effects
  primary: Stat;
  secondary: Stat;
  affinity: WeaponType[];
  unlock: { type: "start" } | { type: "boss"; bossId: string };
  blurb: string;
}

interface SkillDef {
  id: string;                          // "priest_heal"
  classId: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  kind: "active" | "passive" | "toggle";
  tags: string[];
  req: Partial<Record<Stat, number>>;
  gold: number;                        // learn cost
  maxRank: 3 | 5;
  target?: "self" | "enemy" | "direction" | "ground";
  range?: number;                      // metres
  cast?: number;                       // seconds
  cooldown?: Ranked;
  sp?: Ranked;
  goldPerUse?: { base: number; perLevel: number };
  hpCostPct?: number;
  affinity?: WeaponType[];
  effects: EffectDef[];
  anim?: string; vfx?: string; sfx?: string;
  ai?: { priority: number; when?: "always" | "enemiesInRange" | "hpBelow" | "boss"; value?: number };
  text: string;                        // "{matk}"-style placeholders filled from rank values
}

type EffectDef =
  | { type: "damage"; school: "physical" | "magic"; element?: Element | "weapon"; atk?: Ranked; matk?: Ranked; hits?: number; canCrit?: boolean; ignoreDefPct?: number }
  | { type: "projectile"; speed: number; radius: number; count?: Ranked; spreadDeg?: number; pierce?: number; homing?: boolean; bounce?: Ranked; onHit: EffectDef[] }
  | { type: "area"; shape: "circle" | "cone" | "line" | "donut" | "cross"; at: "self" | "target" | "ground"; radius?: number; angleDeg?: number; length?: number; width?: number; inner?: number; delay?: number; duration?: number; tick?: number; onTick: EffectDef[] }
  | { type: "heal"; who: "self" | "summons" | "selfAndSummons"; matk?: Ranked; maxHpPct?: Ranked; radius?: number }
  | { type: "shield"; maxHpPct?: Ranked; matk?: Ranked; duration: Ranked }
  | { type: "status"; status: StatusId; duration: Ranked; chance?: Ranked; power?: Ranked }
  | { type: "buff" | "debuff"; mods: StatMod[]; duration: Ranked; who?: "self" | "summons" | "selfAndSummons" | "targets" }
  | { type: "dash"; distance: number; speed: number; to?: "direction" | "behindTarget" | "point"; iframes?: number; onArrive?: EffectDef[] }
  | { type: "summon"; unitId: string; count: Ranked; duration: number; maxAlive: Ranked }
  | { type: "displace"; kind: "knockback" | "pull"; distance: number }
  | { type: "taunt"; radius: number; duration: Ranked }
  | { type: "cleanse"; count: number }
  | { type: "resource"; resource: "orbs" | "coins"; amount: number | "all"; spend?: boolean }
  | { type: "toggle"; mods: StatMod[]; spPerSec: number }
  | { type: "trigger"; on: "hit" | "crit" | "kill" | "block" | "damaged" | "lowHp" | "dodge" | "lethal" | "summonDeath"; chance?: Ranked; icd?: Ranked; threshold?: number; effects: EffectDef[] }
  | { type: "modifier"; mods: StatMod[]; tags?: string[] };

interface SummonDef {
  id: string;
  model: string;
  hpPctOfOwner: number;
  archetype: "chaser" | "kiter";
  attack: { school: "physical" | "magic"; element: Element; atk?: Ranked; matk?: Ranked; aps: number; range: number };
  taunt?: { radius: number };
}
```

### Monsters, bosses and zones

```ts
interface AttackDef {
  id: string;
  weight: number;                      // chance to be picked among ready attacks
  cooldown: number;
  range: number;
  telegraph?: { shape: "circle" | "cone" | "line" | "donut" | "cross"; at: "self" | "target" | "targetLocked"; radius?: number; angleDeg?: number; length?: number; width?: number; inner?: number; warn: number };
  projectile?: { speed: number; count?: number; spreadDeg?: number };
  damage?: { atkPct: number; element?: Element; status?: { id: StatusId; chance: number; duration: number } };
  displace?: { kind: "knockback" | "pull"; distance: number };
  summon?: { monsterId: string; count: number };
  script?: string;                     // boss script hook for a unique mechanic
}

interface MonsterDef {
  id: string; name: string; zoneId: string;
  race: Race; element: Element;
  archetype: "chaser" | "kiter" | "caster" | "charger" | "swarmer" | "burrower" | "exploder" | "support" | "splitter";
  model: string;                       // key in modelMap.json
  mult?: { hp?: number; atk?: number; def?: number; mdef?: number; hit?: number; flee?: number; speed?: number; aps?: number };
  moveSpeed: number;                   // m/s
  aggroRange: number;
  packSize: [number, number];
  attacks: AttackDef[];
  cardId: string;
}

interface BossDef extends MonsterDef {
  level: number;
  hpMult: number;
  arenaRadius: number;
  phases: { belowHpPct: number; attacks: string[]; onEnter?: string }[];
  enrage: { atSec: number; mods: StatMod[] };
  legendaryIds: [string, string];
  firstKill: { unlockClasses?: string[]; unlockZone?: string; activeSlots?: number; passiveSlots?: number; presets?: number; feature?: "tower" | "refine10" | "nightmare"; guaranteedItemId?: string };
}

interface ZoneDef {
  id: string; name: string; levels: [number, number]; element: Element;
  field: {
    size: [number, number]; seed: number; fog: string;
    spawnPoints: { x: number; z: number; level: number }[];
    obstacles: { x: number; z: number; r?: number; w?: number; d?: number }[];
    props: { model: string; x: number; z: number; rot: number; scale: number }[];
  };
  monsters: { id: string; weight: number }[];
  eliteId: string; eliteEverySec: number;
  bossId: string; gauge: { full: number; normal: number; elite: number };
  maxAlive: number; respawnSec: number;
  materialId: string;
}
```

### Items and cards

```ts
type EquipSlot = "weapon" | "offhand" | "head" | "armor" | "garment" | "shoes" | "acc1" | "acc2";

interface ItemDef {
  id: string; name: string;
  slot: "weapon" | "offhand" | "head" | "armor" | "garment" | "shoes" | "accessory";
  weaponType?: WeaponType; offhandType?: "shield" | "tome"; twoHanded?: boolean;
  tier: 1 | 2 | 3 | 4 | 5 | 6; levelReq: number;
  base: { atk?: number; matk?: number; def?: number; mdef?: number; maxSpPct?: number; flee?: number; moveSpeedPct?: number; blockPct?: number; stats?: Partial<Record<Stat, number>> };
  aps?: number; range?: number;
  maxSlots: number;
  legendary?: { effects: EffectDef[]; text: string };
  model?: string; sellPrice: number;
}

interface ItemInstance {
  uid: string; defId: string;
  rarity: "common" | "fine" | "rare" | "epic" | "legendary";
  refine: number;                        // 0-10
  bonus: Partial<Record<Stat, number>>;  // Rare and Epic random stats
  slots: (string | null)[];              // socketed card ids
  locked?: boolean;
}

interface CardDef { id: string; name: string; sourceId: string; slot: ItemDef["slot"]; effects: EffectDef[]; text: string }
```

### Save file

```ts
interface SaveData {
  version: number;
  savedAt: string;                       // ISO time
  hero: {
    name: string; look: string;
    level: number; exp: number; gold: number;
    skillPointsFree: number;
    learned: Record<string, number>;     // skill id -> rank
    presets: {
      stats: Record<Stat, number>;
      statPointsFree: number;            // every level-up adds points to each preset
      actives: (string | null)[];        // 6
      passives: (string | null)[];       // 4
      consumables: (string | null)[];    // 2
      equipment: Partial<Record<EquipSlot, string>>; // item uids
    }[];
    activePreset: number;
    inventory: ItemInstance[]; storage: ItemInstance[]; overflow: ItemInstance[];
    stacks: Record<string, number>;      // materials, consumables, unsocketed cards
    bagSize: number;
  };
  progress: {
    unlockedClasses: string[]; unlockedZones: string[];
    bossKills: Record<string, number>; cardPity: Record<string, number>;
    codex: string[];                     // card ids found
    tower: { best: number; checkpoint: number; tokens: number };
    nightmare: boolean;
    slots: { active: number; passive: number; presets: number };
  };
  lifetime: { kills: number; deaths: number; playSec: number };
  settings: Record<string, unknown>;
}
```

- Bump `version` on every schema change and add `migrations[v]`, which upgrades version v to v + 1.
- Keep a fixture save for every past version, and have a test load each one.

### Examples

Ember Bolt, an active skill:

```json
{
  "id": "mage_ember_bolt",
  "classId": "mage",
  "name": "Ember Bolt",
  "tier": 1,
  "kind": "active",
  "tags": ["magic", "projectile", "fire"],
  "req": { "INT": 5 },
  "gold": 100,
  "maxRank": 5,
  "target": "enemy",
  "range": 10,
  "cast": 0.6,
  "cooldown": 3,
  "sp": 10,
  "affinity": ["staff"],
  "effects": [
    {
      "type": "projectile", "speed": 18, "radius": 0.4,
      "onHit": [
        { "type": "damage", "school": "magic", "element": "fire", "matk": [1.6, 3.0] },
        { "type": "status", "status": "burn", "chance": [0.2, 1.0], "duration": 3, "power": 0.3 }
      ]
    }
  ],
  "anim": "cast_1h", "vfx": "projectile_glow", "sfx": "spell_fire",
  "ai": { "priority": 50, "when": "enemiesInRange" },
  "text": "Hurl an ember for {matk} MATK fire damage, with a {chance} chance to burn for 3 s."
}
```

Bone Servant and the unit it summons:

```json
{
  "id": "necro_bone_servant", "classId": "necromancer", "name": "Bone Servant",
  "tier": 1, "kind": "active", "tags": ["magic", "summon", "shadow"],
  "req": { "INT": 10 }, "gold": 100, "maxRank": 5,
  "target": "self", "cooldown": 10, "sp": 18, "affinity": ["staff", "dagger"],
  "effects": [{ "type": "summon", "unitId": "skeleton_warrior", "count": 1, "duration": 30, "maxAlive": [1, 3] }],
  "text": "Raise a skeleton for 30 s, up to {maxAlive} at once."
}
```

```json
{
  "id": "skeleton_warrior", "model": "kaykit_skeleton_warrior", "hpPctOfOwner": 0.3, "archetype": "chaser",
  "attack": { "school": "magic", "element": "shadow", "matk": [0.4, 0.7], "aps": 0.9, "range": 1.8 }
}
```

Second Wind's effect, a trigger:

```json
{ "type": "trigger", "on": "lethal", "icd": [300, 180], "effects": [
  { "type": "heal", "who": "self", "maxHpPct": [0.2, 0.4] },
  { "type": "shield", "maxHpPct": 0.3, "duration": 3 }
] }
```

Queen Gelatina's Bounce Slam, a boss attack:

```json
{
  "id": "gelatina_bounce_slam", "weight": 3, "cooldown": 6, "range": 12,
  "telegraph": { "shape": "circle", "at": "targetLocked", "radius": 3.5, "warn": 1.2 },
  "damage": { "atkPct": 1.8 },
  "displace": { "kind": "knockback", "distance": 2 }
}
```

## 17. Milestones & acceptance criteria

Six milestones take Jobforge from an empty repo to v1, and each one ends in a build you can play on a phone. M6 is optional work after v1.

&#91;embedded content: build roadmap · 6 milestones plus 1 optional\]

Each milestone builds on the one before. M3 and M4 mostly add content as data on top of the engine from M1 and M2.

Tick each box when it passes on a real phone.

### M0: Foundations

- [ ] Vite, TypeScript and three.js project, deployed as a preview on a static host
- [ ] Landscape handling with the rotate screen, safe areas and blocked touch defaults
- [ ] Floating joystick, 6 skill buttons, keyboard and mouse; the joystick and a skill button work at the same time
- [ ] Camera follow in a test arena with one KayKit hero (idle, run and attack animations), and the Character Animations rig confirmed
- [ ] Auto-attack against 30 instanced training dummies, with damage numbers
- [ ] Debug panel: FPS, draw calls, time scale, god mode, bone names
- [ ] Installs to the Home Screen and reloads offline
- [ ] 60 fps on both reference phones in the test arena

### M1: Combat core

- [ ] Sim and render split, with a 30 Hz fixed tick and interpolation
- [ ] Stats and formulas module, with a unit test for every formula in Section 6
- [ ] Skill engine with every primitive, and Knight and Mage (16 skills) running from JSON
- [ ] Chaser, kiter, caster and charger monsters, telegraphs and status effects
- [ ] Zone 1 field: spawner, packs, elite, boss gauge and portal
- [ ] Queen Gelatina with every pattern and both splits, the victory chest and the results screen
- [ ] Death returns the hero to town with loot kept

### M2: Progression and town

- [ ] Base EXP and levels, stat points, and the Status window with preview and Unlocks list
- [ ] Guild Hall learning (trainer, requirement, tier prerequisite, gold), ranks and free rank reset
- [ ] Loadout screen with dormant skills, and the skill bar locked inside zones
- [ ] Item drops, rarity, inventory, equipment, compare, shop and selling
- [ ] Town hub, World Map and Oracle stat reset
- [ ] Saves: 3 slots, IndexedDB, autosave, export and import, and the migration test
- [ ] Levels 1–15 playable without debug tools

### M3: Content wave 1

- [ ] Archer, Priest, Thief and Merchant (32 more skills)
- [ ] Zones 2–3 and Bosses 2–3, with every monster archetype
- [ ] Cards, the Codex and the Blacksmith (refining to +7, sockets)
- [ ] Auto-battle in fields
- [ ] Endless Tower floors 1–30
- [ ] Simulator: 6 pure basic builds beat Bosses 1–3 within 4 minutes each

### M4: Content wave 2

- [ ] Berserker, Monk, Paladin, Necromancer, Ninja and Gunslinger (48 skills), unlocked by Bosses 1–3
- [ ] Zones 4–6, Bosses 4–6 and the 12 legendaries
- [ ] Preset slots 2–3, refining to +10 and Nightmare
- [ ] Tower floors 1–100 with affixes and the Token shop
- [ ] Simulator: 12 pure and 5 hybrid builds beat Malgrath, and no build clears fields more than 2× faster than the median

### M5: Polish and balance

- [ ] Effects and sounds for every skill and enemy attack, with the music decision applied
- [ ] Coach marks, complete settings and the accessibility options
- [ ] Performance budgets met on the reference phones, and the Low preset at 30 fps or better on an older phone
- [ ] A 2-hour session with no memory growth and no console errors
- [ ] Time-to-kill and pace targets (Section 13) within ±20%
- [ ] The Credits screen lists every asset and license

### M6: After v1 (optional)

See Section 18.

## 18. Out of scope & future

v1 ships without story, online features or monetization. After v1, add features in this order, ranked by how much each adds to the grind:

1. **Rebirth:** at level 99, restart at level 1 with 100 stat points (Ragnarok's number for a reborn character, per its [stats page](<https://ragnarok.fandom.com/wiki/Stats_(RO)>)), keeping skills, gear and cards, and unlocking Rebirth-only bonuses.
2. **Hell difficulty** and local Tower leaderboards.
3. **Four more classes:** Bard, Witch, Druid and Sage, the "16 classes" option.
4. **Pets** tamed from monsters, each adding a small passive.
5. **Cloud save and sync** between devices. This needs a small backend, such as Cloudflare Workers with KV or D1.
6. **Bahasa Indonesia** translation.
7. **A walkable 3D town.**

Out of scope unless Gwendy changes it: multiplayer, co-op and PvP; ads, in-app purchases and other monetization; story and quest chains; crafting beyond refining and cards; housing and guilds.

## 19. Open questions

Seven small calls are still open. None of them blocks M0, and the builder uses the default in brackets until Gwendy decides.

- [ ] Music in v1: three CC0 loops, or none until polish? (Default: none until M5.)
- [ ] Hosting: GitHub Pages, Cloudflare Pages, or only your home Wi-Fi for now? (Default: local Wi-Fi, then GitHub Pages.)
- [ ] Where will Sonnet build: Claude Code on your Windows PC (portable Node, no admin rights needed) or a cloud session? (Default: either works.)
- [ ] Name: keep "Jobforge" or choose another? (Default: Jobforge.)
- [ ] Respec: keep 5 × level² gold, or make resets item-only for a harder, Ragnarok-style feel? (Default: gold.)
- [ ] Auto-battle: fields and Tower only, as planned, or boss fights too? (Default: fields and Tower only.)
- [ ] Hero looks: are the 5 free KayKit adventurers enough, or should you buy the EXTRA tier ($7.95+) for 3 more adventurers and alternative textures? (Default: free tier.)

## Sources

- [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)
- [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations)
- [KayKit Skeletons](https://kaylousberg.itch.io/kaykit-skeletons)
- [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html)
- [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio)
- [game-icons.net license](https://game-icons.net/about.html)
- [Ragnarok Online stats (Ragnarok wiki)](<https://ragnarok.fandom.com/wiki/Stats_(RO)>)
- [Ragnarok Online stat point costs (iRO Wiki)](https://irowiki.org/wiki/Total_stat_point_requirement)
- [Battleheart Legacy combat (Battleheart Legacy wiki)](https://battleheartlegacy.fandom.com/wiki/Combat?oldid=8316)
- [Battleheart Legacy skill trees (Pocket Gamer)](https://www.pocketgamer.com/battleheart-legacy/battleheart-legacy-every-skill-tree-for-every-class/)
- [Battleheart Legacy rogue skills (Pocket Gamer)](https://www.pocketgamer.com/articles/059893/r/)
- [Safari's 7-day storage cap and Home Screen web apps (Michael Tsai)](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/)
