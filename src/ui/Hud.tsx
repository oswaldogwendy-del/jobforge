import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DebugApi, DebugStats } from '../debug/api';
import { strings } from '../data/schema';
import { dismissToast, subscribeToast, type ToastState } from './toast';

const SCALES = [0.25, 0.5, 1, 2];

function DebugPanel({ api }: { api: DebugApi }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<DebugStats>(api.stats());
  const [scale, setScale] = useState(api.getTimeScale());
  const [god, setGod] = useState(api.getGodMode());
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

export function mountHud(root: HTMLElement, api: DebugApi): void {
  render(
    <>
      <DebugPanel api={api} />
      <Toast />
    </>,
    root,
  );
}
