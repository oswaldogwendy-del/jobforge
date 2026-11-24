// iOS only starts audio after a user gesture. Create and resume the AudioContext on the first
// touch so later milestones can play sounds straight away (PRD Section 5, Phone ergonomics).
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Audio is optional in M0.
  }
}

export function audioState(): string {
  return ctx?.state ?? 'none';
}
