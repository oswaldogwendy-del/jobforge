# One-off generator for src/data/monsters.json, bosses.json and zones.json (Zone 1 field layout from
# a fixed seed, PRD Section 11). Run once, then tune the JSON by hand; it is kept for reference.
import json, math

def atk(id, w, cd, rng, **k):
    d = dict(id=id, weight=w, cooldown=cd, range=rng); d.update(k); return d
def tele(shape, at, warn, **k):
    return dict(shape=shape, at=at, warn=warn, **k)

mon = [
 dict(id="training_dummy", name="Training Dummy", zoneId="yard", race="formless", element="neutral", archetype="dummy", model="dummy",
      mult=dict(hp=1.0), moveSpeed=0, aggroRange=0, packSize=[1,1], attacks=[], cardId="", radius=0.7),
 dict(id="jellop", name="Jellop", zoneId="meadowmere", race="formless", element="neutral", archetype="chaser", model="jellop",
      mult=dict(hp=1.0, atk=1.0), moveSpeed=3.0, aggroRange=10, packSize=[2,4], radius=0.7, cardId="card_jellop",
      attacks=[atk("jellop_bump", 1, 1.6, 1.7, damage=dict(atkPct=1.0))]),
 dict(id="hopbun", name="Hopbun", zoneId="meadowmere", race="brute", element="earth", archetype="chaser", model="hopbun",
      mult=dict(hp=0.8, atk=0.9), moveSpeed=4.4, aggroRange=10, packSize=[2,3], radius=0.6, cardId="card_hopbun",
      attacks=[atk("hopbun_kick", 1, 1.3, 1.6, damage=dict(atkPct=0.9, element="earth"))]),
 dict(id="buzzwing", name="Buzzwing", zoneId="meadowmere", race="insect", element="wind", archetype="kiter", model="buzzwing",
      mult=dict(hp=0.7, atk=0.9), moveSpeed=3.6, aggroRange=11, packSize=[2,3], radius=0.55, cardId="card_buzzwing",
      attacks=[atk("buzzwing_sting", 1, 2.2, 9, projectile=dict(speed=11), damage=dict(atkPct=0.8, element="poison", status=dict(id="poison", chance=0.3, duration=4)))]),
 dict(id="capshroom", name="Capshroom", zoneId="meadowmere", race="plant", element="earth", archetype="caster", model="capshroom",
      mult=dict(hp=0.9, atk=1.0), moveSpeed=2.2, aggroRange=10, packSize=[2,3], radius=0.65, cardId="card_capshroom",
      attacks=[atk("capshroom_spores", 1, 3.4, 9, telegraph=tele("circle", "targetLocked", 1.0, radius=2.5), damage=dict(atkPct=1.0, element="poison", status=dict(id="poison", chance=0.5, duration=4)))]),
 dict(id="thornling", name="Thornling", zoneId="meadowmere", race="plant", element="earth", archetype="chaser", model="thornling",
      mult={"hp": 1.8, "atk": 1.1, "def": 1.3}, moveSpeed=2.4, aggroRange=9, packSize=[2,3], radius=0.8, cardId="card_thornling",
      attacks=[atk("thornling_slap", 1, 1.8, 1.9, damage=dict(atkPct=1.1, element="earth"))]),
 dict(id="rootmole", name="Rootmole", zoneId="meadowmere", race="brute", element="earth", archetype="burrower", model="rootmole",
      mult=dict(hp=1.0, atk=1.2), moveSpeed=3.2, aggroRange=8, packSize=[2,3], radius=0.6, cardId="card_rootmole",
      attacks=[atk("rootmole_erupt", 3, 4.0, 8, telegraph=tele("circle", "targetLocked", 0.9, radius=2.2), damage=dict(atkPct=1.6, element="earth")),
               atk("rootmole_bite", 2, 1.5, 1.6, damage=dict(atkPct=0.9, element="earth"))]),
 dict(id="thorn_guardian", name="Thorn Guardian", zoneId="meadowmere", race="plant", element="earth", archetype="chaser", model="thorn_guardian",
      mult=dict(hp=1.0, atk=1.0), moveSpeed=3.0, aggroRange=12, packSize=[1,1], radius=1.1, cardId="card_thorn_guardian", elite=True,
      attacks=[atk("guardian_vines", 3, 5.0, 9, telegraph=tele("line", "targetLocked", 0.9, length=8, width=1.8), damage=dict(atkPct=1.4, element="earth", status=dict(id="root", chance=1.0, duration=1.5))),
               atk("guardian_slam", 2, 2.2, 2.4, damage=dict(atkPct=1.2, element="earth"))]),
]
json.dump(mon, open('src/data/monsters.json', 'w'), indent=2); open('src/data/monsters.json', 'a').write("\n")

boss = [dict(id="queen_gelatina", name="Queen Gelatina", zoneId="meadowmere", race="formless", element="neutral", archetype="chaser", model="queen_gelatina",
 mult=dict(atk=1.0), moveSpeed=3.0, aggroRange=40, packSize=[1,1], radius=2.2, cardId="card_queen_gelatina",
 level=12, hpMult=70, arenaRadius=15,
 attacks=[
   atk("gelatina_bounce_slam", 3, 6.0, 12, telegraph=tele("circle", "targetLocked", 1.2, radius=3.5), damage=dict(atkPct=1.8), displace=dict(kind="knockback", distance=2)),
   atk("gelatina_jelly_spit", 2, 7.0, 12, projectile=dict(speed=9, count=3, spreadDeg=24), damage=dict(atkPct=0.7, status=dict(id="slow", chance=1.0, duration=2))),
   atk("gelatina_royal_roll", 2, 9.0, 22, telegraph=tele("line", "targetLocked", 1.0, length=20, width=3), damage=dict(atkPct=2.2)),
 ],
 phases=[dict(belowHpPct=100, attacks=["gelatina_bounce_slam", "gelatina_jelly_spit", "gelatina_royal_roll"]),
         dict(belowHpPct=66, attacks=["gelatina_bounce_slam", "gelatina_jelly_spit", "gelatina_royal_roll"], onEnter="split"),
         dict(belowHpPct=33, attacks=["gelatina_bounce_slam", "gelatina_jelly_spit", "gelatina_royal_roll"], onEnter="split")],
 enrage=dict(atSec=240, mods=[dict(stat="moveSpeed", pct=0.4), dict(stat="doubleSlam", add=1)]),
 legendaryIds=["royal_jelly_crown", "wobbling_scepter"],
 firstKill=dict(unlockClasses=["berserker", "monk"], unlockZone="hollowbone", activeSlots=5))]
json.dump(boss, open('src/data/bosses.json', 'w'), indent=2); open('src/data/bosses.json', 'a').write("\n")

def mulberry(seed):
    s = [seed & 0xffffffff]
    def nxt():
        s[0] = (s[0] + 0x6d2b79f5) & 0xffffffff
        t = s[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return nxt
rnd = mulberry(20261101)
W, D = 80, 80
xs = [-18, 16, -6, 20, -20, 8, -14, 18, -4, 0]
zs = [28, 20, 12, 4, -4, -12, -18, -24, -30, -34]
spawn = []
for x, z in zip(xs, zs):
    t = (34 - z) / 68.0
    spawn.append(dict(x=x, z=z, level=max(1, min(12, round(1 + 11 * t)))))
obst, props = [], []
tries = 0
while len(obst) < 22 and tries < 4000:
    tries += 1
    x = (rnd() * 2 - 1) * 36; z = (rnd() * 2 - 1) * 34
    if z > 30 and abs(x) < 8: continue
    if any(math.hypot(x - s['x'], z - s['z']) < 6 for s in spawn): continue
    if any(math.hypot(x - o['x'], z - o['z']) < (o.get('r', 2.5) + 3.5) for o in obst): continue
    kind = rnd()
    if kind < 0.55:
        r = round(0.9 + rnd() * 1.1, 2)
        obst.append(dict(x=round(x, 2), z=round(z, 2), r=r))
        props.append(dict(model="rock", x=round(x, 2), z=round(z, 2), rot=round(rnd() * 6.28, 2), scale=r))
    elif kind < 0.9:
        obst.append(dict(x=round(x, 2), z=round(z, 2), r=0.6))
        props.append(dict(model="tree", x=round(x, 2), z=round(z, 2), rot=round(rnd() * 6.28, 2), scale=round(1.0 + rnd() * 0.8, 2)))
    else:
        w = round(3 + rnd() * 3, 1)
        obst.append(dict(x=round(x, 2), z=round(z, 2), w=w, d=1.2))
        props.append(dict(model="wall", x=round(x, 2), z=round(z, 2), rot=0, scale=1))
for i in range(40):
    props.append(dict(model="bush", x=round((rnd() * 2 - 1) * 38, 2), z=round((rnd() * 2 - 1) * 38, 2), rot=round(rnd() * 6.28, 2), scale=round(0.6 + rnd() * 0.5, 2)))
zone = [dict(id="meadowmere", name="Meadowmere Fields", levels=[1, 12], element="earth",
 field=dict(size=[W, D], seed=20261101, fog="#a9d8f0", spawnPoints=spawn, obstacles=obst, props=props),
 monsters=[dict(id="jellop", weight=30), dict(id="hopbun", weight=18), dict(id="buzzwing", weight=14), dict(id="capshroom", weight=14), dict(id="thornling", weight=14), dict(id="rootmole", weight=10)],
 eliteId="thorn_guardian", eliteEverySec=150, bossId="queen_gelatina", gauge=dict(full=100, normal=1, elite=10), maxAlive=30, respawnSec=10, materialId="iron_shard")]
json.dump(zone, open('src/data/zones.json', 'w'), indent=2); open('src/data/zones.json', 'a').write("\n")
print(len(spawn), "spawns", len(obst), "obstacles", len(props), "props")
