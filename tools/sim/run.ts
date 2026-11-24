// Headless simulator (PRD Section 4). Runs the pure simulation with a simple bot, far faster than
// real time, and reports kills per minute, EXP per minute, damage per second, damage taken, deaths
// and boss kill time, so balance.json can be tuned against the Section 13 targets.
//
//   npm run sim -- --build=warrior --minutes=10
//   npm run sim -- --build=caster --boss
//   npm run sim -- --all
import { buildFromPreset, devHero } from '../../src/data/content';
import { balance } from '../../src/data/schema';
import { SimWorld } from '../../src/sim/world';
import { botInput } from './bot';

const DT = 1 / balance.tickRate;

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

interface FieldReport {
  build: string;
  minutes: number;
  kills: number;
  killsPerMin: number;
  expPerMin: number;
  dps: number;
  damageTaken: number;
  deaths: number;
  survivedSec: number;
  elites: number;
  medianKillSec: number;
}

function runField(build: string, minutes: number, seed: number): FieldReport {
  const w = new SimWorld({ build: buildFromPreset(build), seed, mode: 'field' });
  let dealt = 0;
  let taken = 0;
  let deaths = 0;
  const killTimes: number[] = [];
  let lastKill = 0;
  const ticks = Math.round(minutes * 60 * balance.tickRate);
  let t = 0;
  for (; t < ticks; t++) {
    w.tick(DT, botInput(w));
    for (const e of w.drainEvents()) {
      if (e.t === 'dmg' && !e.heal) {
        if (e.toHero) taken += e.amount;
        else dealt += e.amount;
      } else if (e.t === 'kill' && !e.boss) {
        killTimes.push(w.time - lastKill);
        lastKill = w.time;
      }
    }
    if (w.run.phase === 'ended') {
      deaths++;
      break;
    }
    // Keep the field going: a full gauge is not the point of a farming measurement.
    if (w.run.gauge >= w.run.gaugeFull - 1) w.run.gauge = 0;
  }
  const sec = Math.max(1, t * DT);
  killTimes.sort((a, b) => a - b);
  return {
    build,
    minutes,
    kills: w.run.kills,
    killsPerMin: (w.run.kills / sec) * 60,
    expPerMin: (w.run.exp / sec) * 60,
    dps: dealt / sec,
    damageTaken: taken,
    deaths,
    survivedSec: sec,
    elites: w.run.elites,
    medianKillSec: killTimes.length ? killTimes[Math.floor(killTimes.length / 2)] : 0,
  };
}

interface BossReport {
  build: string;
  outcome: 'victory' | 'death' | 'timeout';
  killSec: number;
  damageTaken: number;
  heaviestHitPct: number;
  hitsOver50Pct: number;
}

function runBoss(build: string, seed: number): BossReport {
  const w = new SimWorld({ build: buildFromPreset(build), seed, mode: 'field' });
  w.enterBoss();
  w.skipIntro();
  w.tick(DT, { moveX: 0, moveZ: 0, casts: [] });
  const fightStart = w.time;
  let taken = 0;
  let heaviest = 0;
  let over = 0;
  const limit = 8 * 60 * balance.tickRate;
  let outcome: BossReport['outcome'] = 'timeout';
  for (let i = 0; i < limit; i++) {
    w.tick(DT, botInput(w));
    for (const e of w.drainEvents()) {
      if (e.t === 'dmg' && e.toHero && !e.heal && !e.dot) {
        taken += e.amount;
        const pct = e.amount / w.hero.maxHp;
        heaviest = Math.max(heaviest, pct);
        if (pct > 0.5) over++;
      }
    }
    if (w.run.phase === 'chest') {
      outcome = 'victory';
      break;
    }
    if (w.run.phase === 'ended') {
      outcome = 'death';
      break;
    }
  }
  return {
    build,
    outcome,
    killSec: w.time - fightStart,
    damageTaken: taken,
    heaviestHitPct: heaviest * 100,
    hitsOver50Pct: over,
  };
}

const f1 = (n: number) => n.toFixed(1);
const builds = flag('all') ? Object.keys(devHero.presets) : [arg('build', 'warrior')];
const seeds = Number(arg('seeds', '3'));
console.log(
  `Jobforge simulator: level ${devHero.level} test hero, tier-${devHero.weapon.tier} gear, ${seeds} seeds per row\n`,
);

if (!flag('boss')) {
  const minutes = Number(arg('minutes', '10'));
  console.log(`Field (${minutes} min of Meadowmere Fields, bot controlled)`);
  console.log(
    'build      kills/min  EXP/min   DPS    dmg taken  deaths  survived  elites  median s/kill',
  );
  for (const b of builds) {
    for (let s = 1; s <= seeds; s++) {
      const r = runField(b, minutes, 100 + s);
      console.log(
        `${b.padEnd(10)} ${f1(r.killsPerMin).padStart(9)}  ${f1(r.expPerMin).padStart(7)}  ${f1(r.dps).padStart(5)}  ${String(Math.round(r.damageTaken)).padStart(9)}  ${String(r.deaths).padStart(6)}  ${f1(r.survivedSec).padStart(7)}s  ${String(r.elites).padStart(6)}  ${f1(r.medianKillSec).padStart(12)}`,
      );
    }
  }
}
if (flag('boss') || flag('all')) {
  console.log('\nQueen Gelatina (level 12, Normal, target 2 to 3 minutes)');
  console.log('build      outcome   kill time  dmg taken  heaviest hit  hits >50%');
  for (const b of builds) {
    for (let s = 1; s <= seeds; s++) {
      const r = runBoss(b, 200 + s);
      console.log(
        `${b.padEnd(10)} ${r.outcome.padEnd(9)} ${f1(r.killSec).padStart(8)}s  ${String(Math.round(r.damageTaken)).padStart(9)}  ${f1(r.heaviestHitPct).padStart(10)}%  ${String(r.hitsOver50Pct).padStart(8)}`,
      );
    }
  }
}
