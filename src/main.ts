import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { strings } from './data/schema';
import { Game } from './game';
import { showToast } from './ui/toast';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// Rotate screen text. The overlay itself is shown by CSS in portrait (PRD Section 2, Orientation).
$('rotate').innerHTML =
  `<div class="rotate-card"><div class="phone">📱</div><h1>${strings.rotate.title}</h1><p>${strings.rotate.body}</p></div>`;
$('pause').innerHTML =
  `<div class="pause-card"><h1>${strings.paused}</h1><p>${strings.tapToResume}</p></div>`;
$('boot-msg').textContent = strings.loading;

// Phone ergonomics: no pinch zoom, no double-tap zoom, no long-press menu, no pull-to-refresh.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if ((e.target as HTMLElement).closest('.dbg-panel, .scroll, .scroll-x, textarea')) return;
    e.preventDefault();
  },
  { passive: false },
);

const updateSW = registerSW({
  onNeedRefresh() {
    showToast({ text: strings.update, onTap: () => void updateSW(true) });
  },
  onOfflineReady() {
    showToast({ text: strings.offlineReady, ttl: 3500 });
  },
});

Game.create()
  .then((game) => {
    $('boot').classList.add('done');
    game.start();
  })
  .catch((err: unknown) => {
    console.error(err);
    $('boot-msg').textContent = strings.loadFailed;
  });
