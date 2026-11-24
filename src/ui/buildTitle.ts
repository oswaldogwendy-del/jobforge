import { classMap, skillMap } from '../data/content';
import type { HeroBuild } from '../sim/loadout';

/** "Knight · Mage": the hero's top two classes by equipped skills (PRD Section 7). */
export function buildTitle(b: HeroBuild): string {
  const counts = new Map<string, number>();
  for (const id of [...b.actives, ...b.passives]) {
    if (!id) continue;
    const c = skillMap.get(id)?.classId;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, c) => c[1] - a[1])
    .slice(0, 2)
    .map(([id]) => classMap.get(id)?.name ?? id);
  return top.length ? top.join(' · ') : 'Novice';
}
