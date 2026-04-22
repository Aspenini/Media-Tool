import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { showNotification } from '../ui/notification.js';

type ProjectionMode = 'equirectangular' | 'cylindrical' | 'cubemap';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let rafId = 0;
let currentRoot: THREE.Object3D | null = null;
let disposableTextures: THREE.Texture[] = [];
let objectUrl: string | null = null;
let resizeObserver: ResizeObserver | null = null;
let boundContainer: HTMLElement | null = null;

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function disposeSceneContent(): void {
  if (!scene) return;
  if (currentRoot) {
    scene.remove(currentRoot);
    currentRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = obj.material;
        if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
        else mats.dispose();
      }
    });
    currentRoot = null;
  }
  for (const t of disposableTextures) t.dispose();
  disposableTextures = [];
}

function disposeAll(): void {
  stopLoop();
  disposeSceneContent();
  controls?.dispose();
  controls = null;
  camera = null;
  scene = null;
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  boundContainer = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function fitRendererToContainer(): void {
  if (!renderer || !camera || !boundContainer) return;
  const w = boundContainer.clientWidth;
  const h = boundContainer.clientHeight;
  if (w < 2 || h < 2) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  const tab = document.getElementById('viewer360Tab');
  const active = tab?.classList.contains('active') && document.visibilityState === 'visible';
  if (!active || !renderer || !scene || !camera) return;
  controls?.update();
  renderer.render(scene, camera);
}

function ensureEngine(container: HTMLElement): void {
  if (renderer && boundContainer === container) return;

  disposeAll();
  boundContainer = container;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1222);

  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
  camera.position.set(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = -0.35;
  controls.target.set(0, 0, -1);
  controls.update();

  resizeObserver = new ResizeObserver(() => fitRendererToContainer());
  resizeObserver.observe(container);
  fitRendererToContainer();

  stopLoop();
  rafId = requestAnimationFrame(loop);
}

function splitCubemapStrip(image: HTMLImageElement): THREE.CanvasTexture[] {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const faceW = Math.max(1, Math.floor(w / 6));
  const textures: THREE.CanvasTexture[] = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas');
    c.width = faceW;
    c.height = Math.max(1, h);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(image, i * faceW, 0, faceW, h, 0, 0, faceW, h);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    textures.push(tex);
  }
  return textures;
}

function buildEquirectangular(texture: THREE.Texture): THREE.Mesh {
  const geo = new THREE.SphereGeometry(500, 96, 64);
  geo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: texture });
  return new THREE.Mesh(geo, mat);
}

function buildCylindrical(texture: THREE.Texture): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(500, 500, 750, 96, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
  return new THREE.Mesh(geo, mat);
}

function buildCubemapRoom(image: HTMLImageElement): THREE.Mesh {
  const faceTextures = splitCubemapStrip(image);
  disposableTextures.push(...faceTextures);

  const order = faceTextures.slice(0, 6);
  const materials = order.map(
    (map) => new THREE.MeshBasicMaterial({ map, side: THREE.BackSide }),
  );
  const geo = new THREE.BoxGeometry(500, 500, 500);
  return new THREE.Mesh(geo, materials);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = objectUrl;
  });
}

function applyProjection(img: HTMLImageElement, mode: ProjectionMode, sceneRef: THREE.Scene): void {
  disposeSceneContent();

  let mesh: THREE.Mesh;
  if (mode === 'cubemap') {
    mesh = buildCubemapRoom(img);
  } else {
    const loaderTex = new THREE.Texture(img);
    loaderTex.colorSpace = THREE.SRGBColorSpace;
    loaderTex.needsUpdate = true;
    loaderTex.minFilter = THREE.LinearMipmapLinearFilter;
    loaderTex.magFilter = THREE.LinearFilter;
    loaderTex.generateMipmaps = true;
    disposableTextures.push(loaderTex);
    mesh = mode === 'equirectangular' ? buildEquirectangular(loaderTex) : buildCylindrical(loaderTex);
  }

  currentRoot = mesh;
  sceneRef.add(mesh);

  if (camera && controls) {
    camera.position.set(0, 0, 0);
    controls.target.set(0, 0, -1);
    controls.update();
  }
}

export function initViewer360(): void {
  const fileInput = document.getElementById('viewer360Input') as HTMLInputElement | null;
  const projectionSelect = document.getElementById('viewer360Projection') as HTMLSelectElement | null;
  const container = document.getElementById('viewer360CanvasWrap');
  if (!fileInput || !projectionSelect || !container) return;

  const getMode = (): ProjectionMode => {
    const v = projectionSelect.value;
    if (v === 'cylindrical' || v === 'cubemap') return v;
    return 'equirectangular';
  };

  const rebuild = async (showReadyToast: boolean) => {
    ensureEngine(container);
    const file = fileInput.files?.[0];
    if (!file || !scene) return;
    try {
      const img = await loadImageFromFile(file);
      if (getMode() === 'cubemap' && img.naturalWidth < img.naturalHeight * 5) {
        showNotification(
          'Cube map strip works best with a single row of six square faces (about 6:1 width to height).',
          'info',
        );
      }
      applyProjection(img, getMode(), scene);
      if (showReadyToast) {
        showNotification('360 viewer ready — drag to look around.', 'success');
      }
    } catch {
      showNotification('Could not load that image.', 'error');
    }
  };

  fileInput.addEventListener('change', () => {
    void rebuild(true);
  });

  projectionSelect.addEventListener('change', () => {
    if (fileInput.files?.[0]) void rebuild(false);
  });

  document.querySelectorAll<HTMLElement>('.tab-button[data-tab], .mobile-menu-item[data-tab]').forEach((el) => {
    if (el.dataset.tab !== 'viewer360Tab') return;
    el.addEventListener('click', () => {
      ensureEngine(container);
      fitRendererToContainer();
    });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash.toLowerCase() === '#360-viewer') {
      ensureEngine(container);
      fitRendererToContainer();
    }
  });

  if (window.location.hash.toLowerCase() === '#360-viewer') {
    ensureEngine(container);
  }
}
