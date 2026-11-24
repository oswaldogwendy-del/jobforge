# Jobforge: instructions for every session

**Read `docs/PRD.md` in full before doing anything else, then follow its Section 0 rules.** The PRD is the build spec. Where it is silent, pick the simplest option that keeps the pillars (Section 1), log it in `DECISIONS.md` and keep going.

Section 0 in short (the PRD wins on any difference):

- Build milestones in order, M0 to M5 (Section 17). A milestone is done only when its checklist passes on a real phone. Never tick a box you could not verify.
- Content is data: JSON under `src/data/`. Every constant goes in `src/data/balance.json`.
- `src/sim/` never imports three.js or the DOM, so it runs in unit tests and the simulator.
- Phone first. The Section 4 performance budgets are requirements.
- Original IP only. Assets are CC0, and each one is logged in `CREDITS.md`.
- After each milestone, hand back a playable build, a `CHANGELOG.md` entry, known issues, an updated `DECISIONS.md`, and the test results the checklist names.

Repo layout notes:

- `docs/PRD.md` is the spec. `assets-src/` holds the original downloads (KayKit zip). Never put originals in `public/`.
- `tools/assets/build-models.mjs` converts the originals into compressed `.glb` files in `public/assets/models/` (committed).
- Pages deploys from `main` through `.github/workflows/deploy.yml`. Work on the session's feature branch and never push to `main` directly.

Commands: `npm run dev -- --host` (phones on the same Wi-Fi), `npm test`, `npm run lint`, `npm run build`, `npm run assets` (rebuild models).
