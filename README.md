# Jobforge

Phone-first 3D browser action RPG: one hero, 12 class trainers, 96 skills and six stats that decide which skills you can mix. The full spec is in [`docs/PRD.md`](docs/PRD.md). Sessions should also read [`CLAUDE.md`](CLAUDE.md).

## Run

Needs Node 22 (current LTS).

```bash
npm install
npm run dev -- --host   # open the printed Network URL on a phone on the same Wi-Fi
```

Other commands: `npm test`, `npm run lint`, `npm run build`, `npm run preview`, and `npm run assets` to rebuild the compressed models from `assets-src/`.

## Play the deployed build

Pushes to `main` build and publish the game to GitHub Pages through `.github/workflows/deploy.yml`. One-time setup: Settings, then Pages, then Source: **GitHub Actions**. The site is served at `https://<owner>.github.io/jobforge/`.

On an iPhone, open that URL in Safari, tap Share, then Add to Home Screen, and start the game from the new icon.

## Status

Milestone progress is in [`CHANGELOG.md`](CHANGELOG.md). Design calls the PRD leaves open are in [`DECISIONS.md`](DECISIONS.md). Asset licenses are in [`CREDITS.md`](CREDITS.md).
