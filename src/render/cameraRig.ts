import { MathUtils, PerspectiveCamera } from 'three';
import type { Balance } from '../data/schema';

/** Fixed 3/4 camera that follows the hero with a smoothed look-ahead (PRD Section 5, Camera). */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private lookX = 0;
  private lookZ = 0;
  private focusX = 0;
  private focusZ = 0;
  private readonly sinP: number;
  private readonly cosP: number;
  private snapped = false;

  constructor(
    private readonly cfg: Balance,
    aspect: number,
  ) {
    const c = cfg.camera;
    this.camera = new PerspectiveCamera(c.fov, aspect, c.near, c.far);
    const pitch = MathUtils.degToRad(c.pitchDeg);
    this.sinP = Math.sin(pitch);
    this.cosP = Math.cos(pitch);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** dirX and dirZ are the hero's move direction (zero when standing still). */
  update(dt: number, heroX: number, heroZ: number, dirX: number, dirZ: number): void {
    const c = this.cfg.camera;
    const la = 1 - Math.exp(-c.lookAheadRate * dt);
    this.lookX += (dirX * c.lookAhead - this.lookX) * la;
    this.lookZ += (dirZ * c.lookAhead - this.lookZ) * la;
    const tx = heroX + this.lookX;
    const tz = heroZ + this.lookZ;
    if (!this.snapped) {
      this.focusX = tx;
      this.focusZ = tz;
      this.snapped = true;
    } else {
      const f = 1 - Math.exp(-c.followRate * dt);
      this.focusX += (tx - this.focusX) * f;
      this.focusZ += (tz - this.focusZ) * f;
    }
    this.camera.position.set(
      this.focusX,
      this.sinP * c.distance,
      this.focusZ + this.cosP * c.distance,
    );
    this.camera.lookAt(this.focusX, 0, this.focusZ);
  }
}
