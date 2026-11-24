export interface ToastState {
  text: string;
  onTap?: () => void;
  /** Milliseconds until it hides on its own. Omit to keep it until tapped. */
  ttl?: number;
}

type Listener = (t: ToastState | null) => void;
const listeners = new Set<Listener>();
let current: ToastState | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(t: ToastState): void {
  current = t;
  clearTimeout(timer);
  if (t.ttl) timer = setTimeout(() => showToast2(null), t.ttl);
  listeners.forEach((l) => l(current));
}

function showToast2(t: ToastState | null): void {
  current = t;
  listeners.forEach((l) => l(current));
}

export function dismissToast(): void {
  showToast2(null);
}

export function subscribeToast(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}
