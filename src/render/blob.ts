import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

let tex: CanvasTexture | null = null;

/** Radial dark gradient used as a cheap shadow (PRD: Medium and Low presets use blob shadows). */
export function blobTexture(): CanvasTexture {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function blobMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function makeBlob(radius: number): Mesh {
  const m = new Mesh(
    new PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    blobMaterial(),
  );
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}
