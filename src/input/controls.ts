import type { Balance } from '../data/schema';
import { clampKnob, joystickVector } from './joystick';

export interface ControlsHooks {
  /** A tap or click at screen position (px). Used to focus an enemy or clear focus. */
  onTap(clientX: number, clientY: number): void;
  onCastKey(slot: number, mouse: { x: number; y: number } | null): void;
  onCycleFocus(): void;
  onTogglePause(): void;
  onFirstGesture(): void;
}

interface Track {
  id: number;
  startX: number;
  startY: number;
  startT: number;
  moved: number;
}

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Floating joystick, taps and keyboard. Every pointer is tracked by id, so the joystick and a
 * skill button work at the same time (PRD Section 5). Skill buttons handle their own pointers.
 */
export class Controls {
  private stick: (Track & { dx: number; dy: number }) | null = null;
  private taps = new Map<number, Track>();
  private keys = new Set<string>();
  mouse: { x: number; y: number } | null = null;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(
    private readonly layer: HTMLElement,
    private readonly cfg: Balance,
    private readonly hooks: ControlsHooks,
  ) {
    this.base = layer.querySelector('.stick-base') as HTMLElement;
    this.knob = layer.querySelector('.stick-knob') as HTMLElement;
    layer.addEventListener('pointerdown', this.down);
    layer.addEventListener('pointermove', this.move);
    layer.addEventListener('pointerup', this.up);
    layer.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  /** Current move vector, magnitude 0..1: touch stick first, then keyboard. */
  getMove(): { x: number; z: number } {
    if (this.stick) {
      return joystickVector(this.stick.dx, this.stick.dy, this.cfg.joystick);
    }
    let x = 0;
    let z = 0;
    for (const k of this.keys) {
      const d = KEY_DIRS[k];
      if (d) {
        x += d[0];
        z += d[1];
      }
    }
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  /** Releases the stick and keys, for example when the game pauses. */
  releaseAll = (): void => {
    this.stick = null;
    this.taps.clear();
    this.keys.clear();
    this.base.classList.remove('on');
  };

  private down = (e: PointerEvent): void => {
    this.hooks.onFirstGesture();
    const j = this.cfg.joystick;
    const touchLike = e.pointerType !== 'mouse';
    const inZone = e.clientX < window.innerWidth * j.zoneFraction;
    const t: Track = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: performance.now(),
      moved: 0,
    };
    this.layer.setPointerCapture(e.pointerId);
    if (touchLike && inZone && !this.stick) {
      this.stick = { ...t, dx: 0, dy: 0 };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.base.classList.add('on');
    }
    // Every touch is also a potential tap; a quick, short one focuses an enemy.
    this.taps.set(e.pointerId, t);
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY };
    const tap = this.taps.get(e.pointerId);
    if (tap)
      tap.moved = Math.max(tap.moved, Math.hypot(e.clientX - tap.startX, e.clientY - tap.startY));
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.dx = e.clientX - this.stick.startX;
      this.stick.dy = e.clientY - this.stick.startY;
      const k = clampKnob(this.stick.dx, this.stick.dy, this.cfg.joystick.maxRadiusPx);
      this.knob.style.transform = `translate(calc(-50% + ${k.x}px), calc(-50% + ${k.y}px))`;
    }
  };

  private up = (e: PointerEvent): void => {
    const tap = this.taps.get(e.pointerId);
    this.taps.delete(e.pointerId);
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.base.classList.remove('on');
    }
    if (tap) {
      const j = this.cfg.joystick;
      if (performance.now() - tap.startT <= j.tapMaxMs && tap.moved <= j.tapMaxPx) {
        this.hooks.onTap(e.clientX, e.clientY);
      }
    }
  };

  private cancel = (e: PointerEvent): void => {
    this.taps.delete(e.pointerId);
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.base.classList.remove('on');
    }
  };

  private keyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code in KEY_DIRS) {
      this.keys.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      this.hooks.onCycleFocus();
    } else if (e.code === 'Escape') {
      this.hooks.onTogglePause();
    } else if (/^Digit[1-6]$/.test(e.code)) {
      this.hooks.onCastKey(Number(e.code.slice(5)) - 1, this.mouse);
    }
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}
