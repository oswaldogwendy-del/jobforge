import { useEffect, useState } from 'preact/hooks';
import type { SlotInfo } from '../../save/storage';
import type { GameApi } from '../api';
import { buildTitle } from '../buildTitle';
import { buildOf } from '../../sim/profile';
import { gold } from '../itemText';
import { Confirm } from '../kit';
import { hudStore, useHud } from '../store';
import { Credits, ExportImport, Settings } from './Settings';

type Sub = null | 'settings' | 'credits' | 'import';

const isIosBrowser = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator as Navigator & { standalone?: boolean }).standalone;

export function Title({ api }: { api: GameApi }) {
  const h = useHud();
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [del, setDel] = useState<number | null>(null);
  const [importSlot, setImportSlot] = useState(0);
  useEffect(() => {
    let live = true;
    void api.listSlots().then((s) => live && setSlots(s));
    return () => {
      live = false;
    };
  }, [api, h.rev, sub, del]);
  if (sub === 'settings') return <Settings api={api} onClose={() => setSub(null)} />;
  if (sub === 'credits') return <Credits onClose={() => setSub(null)} />;
  return (
    <div class="title">
      <div class="title-card">
        <div class="logo">Jobforge</div>
        <div class="dim">Pick a hero</div>
        <div class="slot-cards">
          {(slots ?? [0, 1, 2].map((slot) => ({ slot, save: null }) as SlotInfo)).map((s) => (
            <div class={`slot-card ${s.save ? '' : 'empty'}`}>
              {s.save ? (
                <>
                  <b>{s.save.hero.name}</b>
                  <div class="small">
                    Lv {s.save.hero.level} · {buildTitle(buildOf(s.save))}
                  </div>
                  <div class="small dim">{gold(s.save.hero.gold)} gold</div>
                  <div class="row">
                    <button
                      type="button"
                      class="big primary"
                      onClick={() => void api.loadSlot(s.slot)}
                    >
                      Play
                    </button>
                    <button type="button" class="small-btn" onClick={() => setDel(s.slot)}>
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <b>Empty slot {s.slot + 1}</b>
                  {s.error && <div class="small bad">{s.error}</div>}
                  <button type="button" class="big" onClick={() => api.toCreate(s.slot)}>
                    New hero
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div class="row">
          <button type="button" class="small-btn" onClick={() => setSub('settings')}>
            Settings
          </button>
          <button type="button" class="small-btn" onClick={() => setSub('credits')}>
            Credits
          </button>
          <button type="button" class="small-btn" onClick={() => setSub('import')}>
            Import save
          </button>
        </div>
        {h.storageWarning && (
          <div class="note">
            Saving is unavailable in this browser mode. Progress is kept only while the page is
            open.
          </div>
        )}
        {isIosBrowser() && (
          <div class="note small">
            On iPhone, tap Share then Add to Home Screen. Safari erases the saves of sites you do
            not open for a week, but not a Home Screen app. Use Export now and then.
          </div>
        )}
      </div>
      {sub === 'import' && (
        <div class="confirm">
          <div class="confirm-card wide">
            <h3>Import a save</h3>
            <div class="row">
              {[0, 1, 2].map((i) => (
                <button
                  type="button"
                  class={i === importSlot ? 'on' : ''}
                  onClick={() => setImportSlot(i)}
                >
                  Slot {i + 1}
                </button>
              ))}
            </div>
            <ExportImport api={api} slot={importSlot} canExport={false} />
            <button type="button" class="big" onClick={() => setSub(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {del !== null && (
        <Confirm
          title="Delete this hero?"
          yes="Delete"
          body="This cannot be undone. Export the save first if you might want it back."
          onNo={() => setDel(null)}
          onYes={() => {
            void api.deleteSlot(del).then(() => setDel(null));
          }}
        />
      )}
    </div>
  );
}

export function leaveTitle(): void {
  hudStore.set({ screen: 'town' });
}
