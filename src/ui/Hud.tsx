import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DebugStats } from '../debug/api';
import { strings } from '../data/schema';
import { LoadoutPanel } from './LoadoutPanel';
import type { GameApi } from './api';
import { hudStore, useHud } from './store';
import { dismissToast, subscribeToast, type ToastState } from './toast';

const SCALES = [0.25, 0.5, 1, 2];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(b, 1)) * 100))}%`;

function Bars() {
  const h = useHud();
  return (
    <div class="bars">
      <div class="who">
        {h.name} · Lv {h.level} <span class="dim">{h.title}</span>
      </div>
      <div class="bar hp">
        <i style={{ width: pct(h.hp, h.maxHp) }} />
        <span>
          {Math.ceil(h.hp)} / {Math.ceil(h.maxHp)}
        </span>
      </div>
      <div class="bar sp">
        <i style={{ width: pct(h.sp, h.maxSp) }} />
        <span>
          {Math.floor(h.sp)} / {Math.floor(h.maxSp)}
        </span>
      </div>
      <div class="buffs">
        {h.buffs.map((b) => (
          <span class={`chip ${b.debuff ? 'debuff' : 'buff'}`}>
            {b.label} {Math.ceil(b.remaining)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TopCenter() {
  const h = useHud();
  if (h.boss) {
    const b = h.boss;
    return (
      <div class="boss">
        <div class="boss-name">{b.name}</div>
        <div class="bar boss-hp">
          <i style={{ width: pct(b.hp, b.maxHp) }} />
          {b.ticks.map((t) => (
            <u style={{ left: `${t}%` }} />
          ))}
          <span>{Math.ceil((b.hp / b.maxHp) * 100)}%</span>
        </div>
        <div class={`bar stagger ${b.staggered ? 'on' : ''}`}>
          <i style={{ width: b.staggered ? '100%' : `${b.stagger}%` }} />
        </div>
      </div>
    );
  }
  if (h.mode === 'field') {
    return (
      <div class="boss">
        <div class="boss-name small">{h.portalOpen ? 'The portal is open!' : 'Boss gauge'}</div>
        <div class={`bar gauge ${h.gauge >= h.gaugeFull ? 'full' : ''}`}>
          <i style={{ width: pct(h.gauge, h.gaugeFull) }} />
          <span>
            {Math.floor(h.gauge)} / {h.gaugeFull}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

function TopRight({ api }: { api: GameApi }) {
  const h = useHud();
  return (
    <div class="topright">
      <span class="timer">{mmss(h.timer)}</span>
      <button type="button" class="pause-btn" aria-label="Pause" onClick={() => api.togglePause()}>
        ❚❚
      </button>
    </div>
  );
}

function Banner() {
  const h = useHud();
  if (!h.banner) return null;
  return <div class="banner">{h.banner}</div>;
}

function Intro({ api }: { api: GameApi }) {
  const h = useHud();
  if (!h.introName) return null;
  return (
    <button type="button" class="intro" onClick={() => api.skipIntro()}>
      <div class="intro-name">{h.introName}</div>
      <div class="intro-sub">Tap to skip</div>
    </button>
  );
}

function PauseMenu({ api }: { api: GameApi }) {
  const h = useHud();
  if (!h.paused) return null;
  return (
    <div class="modal pause-menu">
      <h2>{strings.paused}</h2>
      <button type="button" class="big" onClick={() => api.togglePause()}>
        Resume
      </button>
      {h.screen === 'run' && h.mode !== 'yard' && (
        <button type="button" class="big warn" onClick={() => api.leaveRun()}>
          Leave run (keeps loot)
        </button>
      )}
      {h.screen === 'run' && h.mode === 'yard' && (
        <button type="button" class="big warn" onClick={() => api.returnToTown()}>
          Back to town
        </button>
      )}
    </div>
  );
}

function Town({ api }: { api: GameApi }) {
  const h = useHud();
  const [loadout, setLoadout] = useState(false);
  if (h.screen !== 'town') return null;
  if (loadout) return <LoadoutPanel api={api} onClose={() => setLoadout(false)} />;
  return (
    <div class="town">
      <div class="town-card">
        <div class="logo">Jobforge</div>
        <div class="dim">
          {h.name} · Lv {h.level} · {h.title}
        </div>
        <button type="button" class="big primary" onClick={() => api.startAdventure()}>
          Adventure: Meadowmere Fields (Lv 1–12)
        </button>
        <button type="button" class="big" onClick={() => setLoadout(true)}>
          Loadout (dev)
        </button>
        <button type="button" class="big" onClick={() => api.startYard()}>
          Training Yard
        </button>
        <div class="dim small">
          Status, Guild Hall, shop and saves arrive in M2. Use Loadout to pick stats and skills.
        </div>
      </div>
    </div>
  );
}

function Chest({ api }: { api: GameApi }) {
  const h = useHud();
  if (h.screen !== 'chest' || !h.result) return null;
  const r = h.result;
  return (
    <div class="modal chest">
      <h2>Victory!</h2>
      <div class="dim">Queen Gelatina is defeated</div>
      <ul>
        {r.loot.map((l) => (
          <li class={l.kind}>{l.text}</li>
        ))}
        <li>
          {r.exp} EXP ({(r.expPct * 100).toFixed(0)}% of a level)
        </li>
      </ul>
      <div class="row">
        <button type="button" class="big primary" onClick={() => api.grindAgain()}>
          Grind again
        </button>
        <button type="button" class="big" onClick={() => api.finishChest()}>
          Return to town
        </button>
      </div>
    </div>
  );
}

function Results({ api }: { api: GameApi }) {
  const h = useHud();
  if (h.screen !== 'results' || !h.result) return null;
  const r = h.result;
  const perMin = r.timeSec > 1 ? (r.exp / r.timeSec) * 60 : 0;
  return (
    <div class="modal results">
      <h2>
        {r.outcome === 'death'
          ? 'Defeated'
          : r.outcome === 'victory'
            ? 'Run complete'
            : 'Run results'}
      </h2>
      <table>
        <tbody>
          <tr>
            <td>Time</td>
            <td>{mmss(r.timeSec)}</td>
          </tr>
          <tr>
            <td>Kills</td>
            <td>
              {r.kills} ({r.elites} elite)
            </td>
          </tr>
          <tr>
            <td>EXP gained</td>
            <td>
              {r.exp} ({(r.expPct * 100).toFixed(0)}% of a level)
            </td>
          </tr>
          <tr>
            <td>EXP per minute</td>
            <td>{Math.round(perMin)}</td>
          </tr>
          <tr>
            <td>Gold</td>
            <td>{r.gold}</td>
          </tr>
          <tr>
            <td>Boss</td>
            <td>{r.bossDefeated ? 'Defeated' : 'Not defeated'}</td>
          </tr>
        </tbody>
      </table>
      {r.outcome === 'death' && <div class="dim">You keep your loot and EXP.</div>}
      <div class="dim small">Seed {r.seed}</div>
      <button type="button" class="big primary" onClick={() => api.returnToTown()}>
        Back to town
      </button>
    </div>
  );
}

function DebugPanel({ api }: { api: GameApi }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<DebugStats>(api.stats());
  const [scale, setScale] = useState(api.getTimeScale());
  const [god, setGod] = useState(api.getGodMode());
  const h = useHud();
  const t = strings.debug;
  useEffect(() => {
    const id = setInterval(() => setS(api.stats()), 250);
    return () => clearInterval(id);
  }, [api]);
  return (
    <>
      <button
        class="dbg-toggle"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Debug panel"
      >
        {Math.round(s.fps)}
      </button>
      {open && (
        <div class="dbg-panel">
          <div class="dbg-head">
            <b>{t.toggle}</b>
            <button type="button" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <table>
            <tbody>
              <tr>
                <td>{t.fps}</td>
                <td>{s.fps.toFixed(0)}</td>
              </tr>
              <tr>
                <td>{t.frameMs}</td>
                <td>{s.frameMs.toFixed(1)}</td>
              </tr>
              <tr>
                <td>{t.drawCalls}</td>
                <td>{s.drawCalls}</td>
              </tr>
              <tr>
                <td>{t.triangles}</td>
                <td>{s.triangles}</td>
              </tr>
              <tr>
                <td>{t.pixelRatio}</td>
                <td>{s.pixelRatio}</td>
              </tr>
              <tr>
                <td>Skinned meshes</td>
                <td>{s.skinned}</td>
              </tr>
              <tr>
                <td>Monsters alive</td>
                <td>{s.monsters}</td>
              </tr>
              <tr>
                <td>Projectiles</td>
                <td>{s.projectiles}</td>
              </tr>
            </tbody>
          </table>
          <div class="dbg-row">
            <span>{t.timeScale}</span>
            {SCALES.map((v) => (
              <button
                type="button"
                class={v === scale ? 'on' : ''}
                onClick={() => {
                  api.setTimeScale(v);
                  setScale(v);
                }}
              >
                {v}×
              </button>
            ))}
          </div>
          <div class="dbg-row">
            <span>{t.godMode}</span>
            <button
              type="button"
              class={god ? 'on' : ''}
              onClick={() => {
                api.setGodMode(!god);
                setGod(!god);
              }}
            >
              {god ? 'ON' : 'OFF'}
            </button>
          </div>
          {h.screen === 'run' && (
            <div class="dbg-row">
              <span>Cheats</span>
              {h.mode === 'field' && (
                <button type="button" onClick={() => api.cheat.fillGauge()}>
                  Fill gauge
                </button>
              )}
              {h.mode === 'yard' && (
                <button type="button" onClick={() => api.cheat.spawnCharger()}>
                  Spawn charger
                </button>
              )}
              <button type="button" onClick={() => api.cheat.killAll()}>
                Kill all
              </button>
              <button type="button" onClick={() => api.cheat.heal()}>
                Heal
              </button>
            </div>
          )}
          <details>
            <summary>
              {t.bones} ({api.boneNames.length})
            </summary>
            <div class="dbg-bones">{api.boneNames.join(', ')}</div>
          </details>
        </div>
      )}
    </>
  );
}

function Toast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => subscribeToast(setToast), []);
  if (!toast) return null;
  return (
    <button
      class="toast"
      type="button"
      onClick={() => {
        toast.onTap?.();
        dismissToast();
      }}
    >
      {toast.text}
    </button>
  );
}

function RunHud({ api }: { api: GameApi }) {
  const h = useHud();
  if (h.screen !== 'run') return null;
  return (
    <>
      <Bars />
      <TopCenter />
      <TopRight api={api} />
      <Banner />
    </>
  );
}

export function mountHud(root: HTMLElement, api: GameApi): void {
  render(
    <>
      <RunHud api={api} />
      <Intro api={api} />
      <Town api={api} />
      <Chest api={api} />
      <Results api={api} />
      <PauseMenu api={api} />
      <DebugPanel api={api} />
      <Toast />
    </>,
    root,
  );
  void hudStore;
}
