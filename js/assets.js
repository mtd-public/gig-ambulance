import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/GLTFLoader.js';
import { mergeGeometries } from './vendor/addons/BufferGeometryUtils.js';

// Loads GLBs listed in assets/manifest.json (built by tools/blender/build.py).
const models = {};
let manifest = null;

export async function loadAssets(names, onProgress) {
  manifest = await (await fetch('assets/manifest.json')).json();
  const byName = Object.fromEntries(manifest.assets.map((a) => [a.name, a]));
  const loader = new GLTFLoader();
  // Optional single-file bundle ({name: base64 GLB}) for hosts that can't serve .glb.
  let bundle = null;
  try {
    const res = await fetch('assets/models.bundle.json');
    if (res.ok) bundle = await res.json();
  } catch (_) { /* no bundle: load individual GLBs */ }
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)).buffer;
  let done = 0;
  await Promise.all(names.map(async (n) => {
    if (!byName[n]) throw new Error(`asset ${n} missing from manifest`);
    const gltf = bundle?.[n]
      ? await loader.parseAsync(fromB64(bundle[n]), '')
      : await loader.loadAsync(`assets/${byName[n].file}`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
      }
    });
    models[n] = gltf.scene;
    onProgress?.(++done, names.length);
  }));
}

export function meta(name) {
  return manifest.assets.find((a) => a.name === name);
}

// Shallow clone: shares geometry + materials (cheap). Use cloneMaterials() for
// per-instance material tweaks (e.g. flashing sirens).
export function spawn(name) {
  const src = models[name];
  if (!src) throw new Error(`asset ${name} not loaded`);
  return src.clone(true);
}

export function cloneMaterials(obj) {
  obj.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return obj;
}

// Merge every static mesh under `root` into one mesh per material name, so a
// whole town is a few dozen draw calls instead of thousands.
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.name || o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], shadow: o.castShadow });
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    buckets.get(key).geos.push(g.index ? g : g.toNonIndexed());
  });
  const out = new THREE.Group();
  for (const { material, geos, shadow } of buckets.values()) {
    const indexed = geos.filter((g) => g.index);
    const plain = geos.filter((g) => !g.index);
    for (const list of [indexed, plain]) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
    geos.forEach((g) => g.dispose());
  }
  return out;
}
