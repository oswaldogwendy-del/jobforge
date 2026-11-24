# Changelog

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
