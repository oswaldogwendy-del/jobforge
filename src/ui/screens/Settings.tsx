import { useState } from 'preact/hooks';
import credits from '../../../CREDITS.md?raw';
import type { SettingsData } from '../../save/types';
import type { GameApi } from '../api';
import { Confirm, Panel, useFlash } from '../kit';
import { hudStore } from '../store';

/** Export and Import as a text code. `slot` is where an imported hero is written. */
export function ExportImport({
  api,
  slot,
  canExport,
}: {
  api: GameApi;
  slot: number;
  canExport: boolean;
}) {
  const [code, setCode] = useState('');
  const [msg, flash] = useFlash(4000);
  const [pending, setPending] = useState(false);
  const doImport = async () => {
    const err = await api.importCode(code, slot);
    setPending(false);
    flash(err ?? 'Save imported');
    if (!err) setCode('');
  };
  return (
    <div class="exim">
      {canExport && (
        <div class="row left">
          <button
            type="button"
            class="big"
            onClick={async () => {
              const c = api.exportCode();
              setCode(c);
              try {
                await navigator.clipboard.writeText(c);
                flash('Code copied. Paste it somewhere safe.');
              } catch {
                flash('Select the text below and copy it.');
              }
            }}
          >
            Export save
          </button>
        </div>
      )}
      <textarea
        value={code}
        placeholder="Paste a save code here to import it"
        rows={3}
        onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)}
      />
      <div class="row left">
        <button
          type="button"
          class="big"
          disabled={code.trim().length < 8}
          onClick={() => setPending(true)}
        >
          Import save into slot {slot + 1}
        </button>
      </div>
      {msg && <div class="flash">{msg}</div>}
      {pending && (
        <Confirm
          title="Import this save?"
          yes="Import"
          body={`This replaces whatever is in hero slot ${slot + 1}.`}
          onYes={() => void doImport()}
          onNo={() => setPending(false)}
        />
      )}
    </div>
  );
}

export function Settings({ api, onClose }: { api: GameApi; onClose?: () => void }) {
  const save = (() => {
    try {
      return api.getSave();
    } catch {
      return null;
    }
  })();
  const s = save?.settings;
  const set = (patch: Partial<SettingsData>) => api.setSettings(patch);
  return (
    <Panel title="Settings" onClose={onClose ?? (() => hudStore.set({ menu: null }))}>
      <div class="list">
        <div class="shop-row">
          <span>Damage numbers</span>
          <div class="row">
            {(['on', 'compact', 'off'] as const).map((v) => (
              <button
                type="button"
                class={api.getSettings().damageNumbers === v ? 'on' : ''}
                onClick={() => set({ damageNumbers: v })}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div class="shop-row">
          <span>FPS counter (top right)</span>
          <button
            type="button"
            class={api.getSettings().fpsCounter ? 'on' : ''}
            onClick={() => set({ fpsCounter: !api.getSettings().fpsCounter })}
          >
            {api.getSettings().fpsCounter ? 'on' : 'off'}
          </button>
        </div>
        <div class="shop-row">
          <span>Auto-sell Common items on pickup</span>
          <button
            type="button"
            class={api.getSettings().autoSellCommon ? 'on' : ''}
            onClick={() => set({ autoSellCommon: !api.getSettings().autoSellCommon })}
          >
            {api.getSettings().autoSellCommon ? 'on' : 'off'}
          </button>
        </div>
        <div class="dim small">
          More options (graphics preset, fps cap, UI scale, left-handed mode, volumes) arrive in M5.
        </div>
        <h4>Save code</h4>
        <ExportImport api={api} slot={api.currentSlot()} canExport={!!s} />
      </div>
    </Panel>
  );
}

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Credits" onClose={onClose}>
      <pre class="credits">{credits}</pre>
    </Panel>
  );
}
