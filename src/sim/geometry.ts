export interface Vec2 {
  x: number;
  z: number;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/** Smallest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Heading used for facing: 0 looks along +z, positive turns toward +x. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function circleHits(
  cx: number,
  cz: number,
  radius: number,
  tx: number,
  tz: number,
  tr: number,
): boolean {
  return dist(cx, cz, tx, tz) <= radius + tr;
}

export function coneHits(
  ox: number,
  oz: number,
  heading: number,
  range: number,
  angleRad: number,
  tx: number,
  tz: number,
  tr: number,
): boolean {
  const d = dist(ox, oz, tx, tz);
  if (d > range + tr) return false;
  if (d <= tr) return true;
  const toTarget = headingOf(tx - ox, tz - oz);
  // Widen the cone by the target's angular radius so edges feel fair.
  const slack = Math.asin(Math.min(1, tr / d));
  return Math.abs(angleDiff(heading, toTarget)) <= angleRad / 2 + slack;
}

export function lineHits(
  ox: number,
  oz: number,
  heading: number,
  length: number,
  width: number,
  tx: number,
  tz: number,
  tr: number,
): boolean {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const rx = tx - ox;
  const rz = tz - oz;
  const along = rx * dx + rz * dz;
  if (along < -tr || along > length + tr) return false;
  const across = Math.abs(rx * dz - rz * dx);
  return across <= width / 2 + tr;
}
