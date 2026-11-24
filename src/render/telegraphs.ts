import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  type Scene,
} from 'three';
import type { SimWorld } from '../sim/world';

// One telegraph shader draws circles, cones, lines, donuts and crosses with a fill-progress value,
// an outline and a pattern that differs by kind, so color is never the only cue (PRD Section 10
// and Section 14). Red with diagonal stripes = damage, purple with dots = debuff, blue with a
// grid = freeze.

const VERT = /* glsl */ `
  uniform vec2 uExtent;
  uniform vec2 uCenter;
  varying vec2 vLocal;
  void main() {
    vec2 lp = position.xz * uExtent + uCenter;
    vLocal = lp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(lp.x, 0.0, lp.y, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform int uShape;     // 0 circle, 1 cone, 2 line, 3 donut, 4 cross
  uniform int uKind;      // 0 damage, 1 debuff, 2 freeze
  uniform float uRadius;
  uniform float uAngle;
  uniform float uLength;
  uniform float uWidth;
  uniform float uInner;
  uniform float uProgress;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vLocal;

  float inShape(vec2 p) {
    float r = length(p);
    if (uShape == 0) return step(r, uRadius);
    if (uShape == 1) {
      float a = atan(p.x, p.y);
      return step(r, uRadius) * step(abs(a), uAngle * 0.5);
    }
    if (uShape == 2) return step(0.0, p.y) * step(p.y, uLength) * step(abs(p.x), uWidth * 0.5);
    if (uShape == 3) return step(r, uRadius) * step(uInner, r);
    float arm = step(abs(p.x), uWidth * 0.5) * step(abs(p.y), uRadius)
              + step(abs(p.y), uWidth * 0.5) * step(abs(p.x), uRadius);
    return min(arm, 1.0);
  }

  void main() {
    vec2 p = vLocal;
    float inside = inShape(p);
    if (inside < 0.5) discard;
    // Outline: inside here but not inside one step away in some direction.
    float e = 0.16;
    float minN = min(min(inShape(p + vec2(e, 0.0)), inShape(p - vec2(e, 0.0))),
                     min(inShape(p + vec2(0.0, e)), inShape(p - vec2(0.0, e))));
    float outline = 1.0 - minN;
    // Fill: grows outward from the origin (or along the line) as the warning runs out.
    float reach = (uShape == 2) ? p.y / max(uLength, 0.001) : length(p) / max(uRadius, 0.001);
    float filled = step(reach, uProgress);
    float pattern = 1.0;
    if (uKind == 0) pattern = step(0.5, fract((p.x + p.y) * 1.6 - uTime * 0.6));
    else if (uKind == 1) pattern = step(0.5, fract(p.x * 1.8)) * step(0.5, fract(p.y * 1.8)) + 0.35;
    else pattern = max(step(0.82, fract(p.x * 2.0)), step(0.82, fract(p.y * 2.0))) + 0.3;
    float a = 0.22 + filled * (0.28 + 0.22 * pattern) + outline * 0.6;
    gl_FragColor = vec4(uColor, min(a, 0.95));
  }
`;

const SHAPE_ID = { circle: 0, cone: 1, line: 2, donut: 3, cross: 4 } as const;
const COLOR = {
  damage: new Color(1.0, 0.25, 0.2),
  debuff: new Color(0.7, 0.35, 1.0),
  freeze: new Color(0.35, 0.7, 1.0),
};
const KIND_ID = { damage: 0, debuff: 1, freeze: 2 } as const;

function quad(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3),
  );
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

/** Pooled telegraph meshes driven by the simulation's active telegraphs. */
export class Telegraphs {
  private readonly meshes: Mesh[] = [];
  private readonly geometry = quad();

  constructor(scene: Scene, count = 24) {
    for (let i = 0; i < count; i++) {
      const m = new Mesh(
        this.geometry,
        new ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          uniforms: {
            uExtent: { value: [1, 1] },
            uCenter: { value: [0, 0] },
            uShape: { value: 0 },
            uKind: { value: 0 },
            uRadius: { value: 1 },
            uAngle: { value: 1 },
            uLength: { value: 1 },
            uWidth: { value: 1 },
            uInner: { value: 0 },
            uProgress: { value: 0 },
            uTime: { value: 0 },
            uColor: { value: new Color() },
          },
        }),
      );
      m.visible = false;
      m.position.y = 0.07;
      m.renderOrder = 2;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  update(w: SimWorld, time: number): void {
    let i = 0;
    for (const t of w.telegraphs) {
      if (!t.active) continue;
      const m = this.meshes[i++];
      if (!m) break;
      const u = (m.material as ShaderMaterial).uniforms;
      m.visible = true;
      m.position.set(t.x, 0.07, t.z);
      m.rotation.y = t.heading;
      const pad = 0.8;
      if (t.shape === 'line') {
        u.uExtent.value = [t.width + pad, t.length + pad];
        u.uCenter.value = [0, t.length / 2];
      } else {
        const r = t.radius + pad / 2;
        u.uExtent.value = [r * 2, r * 2];
        u.uCenter.value = [0, 0];
      }
      u.uShape.value = SHAPE_ID[t.shape];
      u.uKind.value = KIND_ID[t.kind];
      u.uRadius.value = t.radius;
      u.uAngle.value = (t.angleDeg * Math.PI) / 180;
      u.uLength.value = t.length;
      u.uWidth.value = t.width;
      u.uInner.value = t.inner;
      u.uProgress.value = Math.min(1, t.t / Math.max(t.warn, 0.001));
      u.uTime.value = time;
      u.uColor.value.copy(COLOR[t.kind]);
    }
    for (; i < this.meshes.length; i++) this.meshes[i].visible = false;
  }
}
