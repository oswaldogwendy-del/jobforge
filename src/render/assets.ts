import { Mesh, MeshLambertMaterial, type Material, type Object3D, type AnimationClip } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_BASE = `${import.meta.env.BASE_URL}assets/models/`;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

/** Loads a model from public/assets/models once; later calls share the result. */
export function loadModel(file: string): Promise<GLTF> {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(MODEL_BASE + file);
    cache.set(file, p);
  }
  return p;
}

export async function loadClips(file: string): Promise<AnimationClip[]> {
  return (await loadModel(file)).animations;
}

/**
 * PRD Section 15 shading: Lambert on the gradient atlas, lit by one directional and one
 * hemisphere light. glTF imports PBR materials, which cost more on phones.
 */
export function toLambert(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const convert = (m: Material): Material => {
      const src = m as unknown as {
        map?: MeshLambertMaterial['map'];
        color?: MeshLambertMaterial['color'];
        name: string;
        vertexColors?: boolean;
      };
      const out = new MeshLambertMaterial({
        map: src.map ?? null,
        color: src.color ?? 0xffffff,
        vertexColors: src.vertexColors ?? false,
      });
      out.name = src.name;
      m.dispose();
      return out;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  });
}

/** Finds a bone by its original glTF name. Three.js strips dots from node names, so check userData too. */
export function findBone(root: Object3D, name: string): Object3D | null {
  const flat = name.replace(/[.\s]/g, '');
  let found: Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (o.userData?.name === name || o.name === name || o.name === flat) found = o;
  });
  return found;
}
