import type { Balance, DebugSkill } from '../data/schema';

export interface SkillButtonHooks {
  /** dir is a unit vector in world x/z when the player dragged to aim, else null for a tap. */
  onCast(slot: number, dir: { x: number; z: number } | null): void;
  /** Live aim while dragging; null when no aim is active. */
  onAim(slot: number, dir: { x: number; z: number } | null): void;
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  aiming: boolean;
  dx: number;
  dy: number;
}

/**
 * Six skill buttons in an arc at the bottom right. Tap smart-casts, drag aims, and dragging back
 * onto the button cancels (PRD Section 5). Plain DOM because these update every frame.
 */
export class SkillButtons {
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly sweeps: HTMLElement[] = [];
  private readonly labels: HTMLElement[] = [];
  private readonly last: number[] = [];
  private readonly drags = new Map<number, Drag>();

  constructor(
    root: HTMLElement,
    skills: DebugSkill[],
    private readonly cfg: Balance,
    private readonly hooks: SkillButtonHooks,
  ) {
    skills.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'skill-btn';
      b.type = 'button';
      b.style.setProperty('--c', s.color);
      b.setAttribute('aria-label', s.name);
      b.innerHTML =
        `<span class="sweep"></span><span class="glyph">${s.glyph}</span>` +
        `<span class="key">${i + 1}</span><span class="cd"></span>`;
      b.addEventListener('pointerdown', (e) => this.down(e, i));
      b.addEventListener('pointermove', (e) => this.move(e, i));
      b.addEventListener('pointerup', (e) => this.up(e, i));
      b.addEventListener('pointercancel', (e) => this.cancel(e, i));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      root.appendChild(b);
      this.buttons.push(b);
      this.sweeps.push(b.querySelector('.sweep') as HTMLElement);
      this.labels.push(b.querySelector('.cd') as HTMLElement);
      this.last.push(-1);
    });
    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  /** Two arcs around the bottom-right corner: four outside, two inside (offsets scale with size). */
  layout(): void {
    const size = this.buttons[0].offsetWidth || 68;
    const ro = size * 2.06;
    const ri = size * 1.1;
    const polar: [number, number][] = [
      [ro, 90],
      [ro, 60],
      [ro, 30],
      [ro, 0],
      [ri, 75],
      [ri, 15],
    ];
    polar.forEach(([r, deg], i) => {
      const a = (deg * Math.PI) / 180;
      const right = r * Math.cos(a);
      const bottom = r * Math.sin(a);
      const b = this.buttons[i];
      // Centre the button on its arc point; the anchor sits half a button in from the screen edge.
      b.style.right = `${right - size / 2}px`;
      b.style.bottom = `${bottom - size / 2}px`;
    });
  }

  /** Called every frame with the sim's cooldown state. Touches the DOM only on change. */
  update(cooldown: number[], cooldownMax: number[], gcd: number): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const remain = Math.max(cooldown[i], gcd);
      const frac =
        remain > 0
          ? remain / (cooldown[i] > gcd ? cooldownMax[i] : this.cfg.skills.globalCooldown)
          : 0;
      const key = Math.round(frac * 100) * 1000 + Math.ceil(remain * 10);
      if (key === this.last[i]) continue;
      this.last[i] = key;
      this.sweeps[i].style.setProperty('--p', String(frac));
      this.labels[i].textContent = cooldown[i] > 0.05 ? String(Math.ceil(cooldown[i])) : '';
      this.buttons[i].classList.toggle('cooling', remain > 0);
    }
  }

  private center(i: number): { x: number; y: number; r: number } {
    const r = this.buttons[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }

  private down = (e: PointerEvent, i: number): void => {
    e.preventDefault();
    this.buttons[i].setPointerCapture(e.pointerId);
    this.buttons[i].classList.add('pressed');
    this.drags.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      aiming: false,
      dx: 0,
      dy: 0,
    });
  };

  private move = (e: PointerEvent, i: number): void => {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    d.dx = e.clientX - d.startX;
    d.dy = e.clientY - d.startY;
    if (!d.aiming && Math.hypot(d.dx, d.dy) >= this.cfg.skills.dragStartPx) d.aiming = true;
    if (d.aiming) {
      const len = Math.hypot(d.dx, d.dy) || 1;
      this.hooks.onAim(i, { x: d.dx / len, z: d.dy / len });
    }
  };

  private up = (e: PointerEvent, i: number): void => {
    const d = this.drags.get(e.pointerId);
    this.drags.delete(e.pointerId);
    this.buttons[i].classList.remove('pressed');
    this.hooks.onAim(-1, null);
    if (!d) return;
    if (!d.aiming) {
      this.hooks.onCast(i, null);
      return;
    }
    // Dragging back onto the button cancels the cast.
    const c = this.center(i);
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) <= c.r) return;
    const len = Math.hypot(d.dx, d.dy) || 1;
    this.hooks.onCast(i, { x: d.dx / len, z: d.dy / len });
  };

  private cancel = (e: PointerEvent, i: number): void => {
    this.drags.delete(e.pointerId);
    this.buttons[i].classList.remove('pressed');
    this.hooks.onAim(-1, null);
  };
}
