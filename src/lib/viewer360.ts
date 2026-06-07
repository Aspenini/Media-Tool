import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type ProjectionMode = 'equirectangular' | 'cylindrical' | 'cubemap';

/** Encapsulates a Three.js panorama viewer bound to a container element. */
export class Viewer360Engine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private rafId = 0;
  private currentRoot: THREE.Object3D | null = null;
  private disposableTextures: THREE.Texture[] = [];
  private resizeObserver: ResizeObserver;
  private container: HTMLElement;
  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1222);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
    this.camera.position.set(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = -0.35;
    this.controls.target.set(0, 0, -1);
    this.controls.update();

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);
    this.fit();
    this.start();
  }

  fit(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible') return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private disposeContent(): void {
    if (this.currentRoot) {
      this.scene.remove(this.currentRoot);
      this.currentRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = obj.material;
          if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
          else mats.dispose();
        }
      });
      this.currentRoot = null;
    }
    for (const t of this.disposableTextures) t.dispose();
    this.disposableTextures = [];
  }

  private splitCubemapStrip(image: HTMLImageElement): THREE.CanvasTexture[] {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const faceW = Math.max(1, Math.floor(w / 6));
    const textures: THREE.CanvasTexture[] = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = faceW;
      c.height = Math.max(1, h);
      c.getContext('2d')?.drawImage(image, i * faceW, 0, faceW, h, 0, 0, faceW, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      textures.push(tex);
    }
    return textures;
  }

  loadImage(img: HTMLImageElement, mode: ProjectionMode): void {
    this.disposeContent();
    let mesh: THREE.Mesh;
    if (mode === 'cubemap') {
      const faceTextures = this.splitCubemapStrip(img);
      this.disposableTextures.push(...faceTextures);
      const materials = faceTextures.map((map) => new THREE.MeshBasicMaterial({ map, side: THREE.BackSide }));
      mesh = new THREE.Mesh(new THREE.BoxGeometry(500, 500, 500), materials);
    } else {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      this.disposableTextures.push(tex);
      if (mode === 'equirectangular') {
        const geo = new THREE.SphereGeometry(500, 96, 64);
        geo.scale(-1, 1, 1);
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
      } else {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(500, 500, 750, 96, 1, true),
          new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }),
        );
      }
    }
    this.currentRoot = mesh;
    this.scene.add(mesh);
    this.camera.position.set(0, 0, 0);
    this.controls.target.set(0, 0, -1);
    this.controls.update();
  }

  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.running = false;
    this.disposeContent();
    this.controls.dispose();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function loadImageObjectUrl(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}
