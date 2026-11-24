# Decisions

Calls made where the PRD is silent or where reality differed from it (PRD Section 0, rule 6). Newest milestone first.

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
