import type { GameApi } from '../api';
import { hudStore, useHud, type Menu } from '../store';

interface Entry {
  menu: Menu;
  label: string;
  badge?: boolean;
  disabled?: string;
}

/** The town hub: a menu over the hero's diorama. Everything is at most two taps away. */
export function TownHub({ api }: { api: GameApi }) {
  const h = useHud();
  const entries: Entry[] = [
    { menu: 'status', label: 'Status', badge: h.badges.status },
    { menu: 'guild', label: 'Guild Hall', badge: h.badges.guild },
    { menu: 'loadout', label: 'Loadout' },
    { menu: 'inventory', label: 'Inventory', badge: h.badges.inventory || h.badges.overflow },
    { menu: 'shop', label: 'Shop' },
    { menu: 'oracle', label: 'Oracle' },
    { menu: 'map', label: 'World Map' },
    { menu: 'settings', label: 'Settings' },
  ];
  return (
    <div class="town">
      <div class="town-card">
        <div class="logo">Jobforge</div>
        <div class="dim">
          {h.name} · Lv {h.level} · {h.title}
        </div>
        <div class="exp-line">
          <i style={{ width: `${Math.round(h.exp * 100)}%` }} />
        </div>
        <button type="button" class="big primary" onClick={() => api.startAdventure()}>
          Adventure: Meadowmere Fields
        </button>
        <div class="hub-grid">
          {entries.map((e) => (
            <button type="button" class="hub-btn" onClick={() => hudStore.set({ menu: e.menu })}>
              {e.label}
              {e.badge && <i class="badge" />}
            </button>
          ))}
          <button type="button" class="hub-btn dim" disabled title="Arrives in M3">
            Blacksmith
          </button>
          <button type="button" class="hub-btn dim" disabled title="Arrives in M3">
            Codex
          </button>
          <button type="button" class="hub-btn dim" disabled title="Arrives in M3">
            Tower
          </button>
          <button type="button" class="hub-btn" onClick={() => api.startYard()}>
            Training Yard
          </button>
        </div>
        <div class="row left">
          <span class="chip">{h.gold.toLocaleString('en-US')} gold</span>
          <button type="button" class="small-btn" onClick={() => api.toTitle()}>
            Switch hero
          </button>
        </div>
      </div>
    </div>
  );
}
