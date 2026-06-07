import { audioBufferToWavBlob } from './wav';
import { getAudioContextClass, resetListener, sanitizeFileName, worldFromPan } from './spatial';

export const MIN_PAN_DIST = 0.82;
export const MAX_PAN_DIST = 4.48;
export const MIN_PAN_HEIGHT = -2.35;
export const MAX_PAN_HEIGHT = 2.5;
export const WORLD_R_FOR_SCALE = 2.5;
export const ONE_PER_SIDE_DIST = 2.35;
export const AZIMUTH_LEFT = -Math.PI / 2;
export const AZIMUTH_RIGHT = Math.PI / 2;

export interface HamburgerTrack {
  id: string;
  file: File;
  name: string;
  azimuth: number;
  distance: number;
  height: number;
}

interface ActiveLayer {
  id: string;
  source: AudioBufferSourceNode;
  panner: PannerNode;
}

function perLayerGainScalar(n: number): number {
  return n <= 1 ? 1 : 1 / Math.sqrt(n);
}

function configurePanner(p: PannerNode): void {
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1;
  p.maxDistance = 80;
  p.rolloffFactor = 0.45;
  p.coneInnerAngle = 360;
  p.coneOuterAngle = 360;
  p.coneOuterGain = 1;
}

export function defaultPanForIndex(index: number, total: number): Pick<HamburgerTrack, 'azimuth' | 'distance' | 'height'> {
  if (total <= 1) return { azimuth: 0, distance: 2.2, height: 0 };
  const spread = Math.PI * 0.72;
  const u = index / (total - 1);
  return { azimuth: (u - 0.5) * spread, distance: 2.2, height: 0 };
}

export function dotHue(index: number, n: number): string {
  const h = (index / Math.max(1, n)) * 280 + 180;
  return `hsl(${h} 78% 58%)`;
}

/** Plays multiple tracks at once, each positioned in 3D around the listener. */
export class HamburgerEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layers: ActiveLayer[] = [];
  private buffers = new Map<string, AudioBuffer>();
  private sessionActive = false;
  private endedCount = 0;
  private volume = 0.85;
  private onAllEnded: () => void;

  constructor(onAllEnded: () => void) {
    this.onAllEnded = onAllEnded;
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const AC = getAudioContextClass();
    this.ctx = new AC();
    resetListener(this.ctx.listener);
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  }

  get isActive(): boolean {
    return this.sessionActive;
  }

  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  setVolume(volume: number, layerCount: number): void {
    this.volume = volume;
    if (this.masterGain) this.masterGain.gain.value = volume * perLayerGainScalar(layerCount || 1);
  }

  private async decode(tracks: HamburgerTrack[], ctx: BaseAudioContext): Promise<void> {
    for (const t of tracks) {
      if (this.buffers.has(t.id)) continue;
      try {
        const ab = await t.file.arrayBuffer();
        this.buffers.set(t.id, await ctx.decodeAudioData(ab.slice(0)));
      } catch (err) {
        console.error('Decode failed for', t.name, err);
      }
    }
  }

  async play(tracks: HamburgerTrack[]): Promise<{ played: number }> {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return { played: 0 };

    if (this.ctx.state === 'suspended' && this.layers.length) {
      await this.ctx.resume();
      return { played: this.layers.length };
    }

    this.stop(false);
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return { played: 0 };

    await this.decode(tracks, this.ctx);
    const playable = tracks.filter((t) => this.buffers.has(t.id));
    if (!playable.length) return { played: 0 };

    this.endedCount = 0;
    this.sessionActive = true;
    const t0 = this.ctx.currentTime;

    for (const track of playable) {
      const buffer = this.buffers.get(track.id)!;
      const panner = this.ctx.createPanner();
      configurePanner(panner);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(panner);
      panner.connect(this.masterGain);
      const { x, y, z } = worldFromPan(track.azimuth, track.distance, track.height);
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
      src.onended = () => this.handleLayerEnded();
      src.start(t0);
      this.layers.push({ id: track.id, source: src, panner });
    }

    this.setVolume(this.volume, playable.length);
    return { played: playable.length };
  }

  private handleLayerEnded(): void {
    if (!this.sessionActive) return;
    this.endedCount += 1;
    if (this.endedCount >= this.layers.length) {
      this.stop(true);
      this.onAllEnded();
    }
  }

  pause(): void {
    if (this.ctx && this.sessionActive) void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  stop(resetContext: boolean): void {
    this.sessionActive = false;
    for (const layer of this.layers) {
      layer.source.onended = null;
      try {
        layer.source.stop();
      } catch {
        /* */
      }
      try {
        layer.source.disconnect();
      } catch {
        /* */
      }
      try {
        layer.panner.disconnect();
      } catch {
        /* */
      }
    }
    this.layers = [];
    this.endedCount = 0;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();

    if (resetContext) {
      if (this.ctx) {
        void this.ctx.close();
        this.ctx = null;
        this.masterGain = null;
      }
    } else if (this.masterGain && this.ctx) {
      try {
        this.masterGain.disconnect();
      } catch {
        /* */
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
  }

  syncPositions(tracks: HamburgerTrack[]): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const track of tracks) {
      const layer = this.layers.find((l) => l.id === track.id);
      if (!layer) continue;
      const { x, y, z } = worldFromPan(track.azimuth, track.distance, track.height);
      layer.panner.positionX.setValueAtTime(x, now);
      layer.panner.positionY.setValueAtTime(y, now);
      layer.panner.positionZ.setValueAtTime(z, now);
    }
  }

  forget(id: string): void {
    this.buffers.delete(id);
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.source.onended = null;
      try {
        layer.source.stop();
      } catch {
        /* */
      }
      this.layers = this.layers.filter((l) => l.id !== id);
    }
  }

  async downloadMix(tracks: HamburgerTrack[], volume: number): Promise<void> {
    const decodeCtx = this.ctx ?? new (getAudioContextClass())();
    const closeDecodeCtx = !this.ctx;
    try {
      await this.decode(tracks, decodeCtx);
      const playable = tracks.filter((t) => this.buffers.has(t.id));
      if (!playable.length) throw new Error('No decodable tracks to export.');

      const sampleRate = Math.max(...playable.map((t) => this.buffers.get(t.id)!.sampleRate));
      const maxDur = Math.max(...playable.map((t) => this.buffers.get(t.id)!.duration));
      if (!Number.isFinite(maxDur) || maxDur <= 0) throw new Error('Invalid audio length.');

      const length = Math.max(1, Math.ceil(maxDur * sampleRate));
      const offline = new OfflineAudioContext(2, length, sampleRate);
      resetListener(offline.listener);

      const master = offline.createGain();
      master.gain.value = volume * perLayerGainScalar(playable.length);
      master.connect(offline.destination);

      for (const track of playable) {
        const buffer = this.buffers.get(track.id)!;
        const panner = offline.createPanner();
        configurePanner(panner);
        const { x, y, z } = worldFromPan(track.azimuth, track.distance, track.height);
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
        const src = offline.createBufferSource();
        src.buffer = buffer;
        src.connect(panner);
        panner.connect(master);
        src.start(0);
      }

      const rendered = await offline.startRendering();
      const blob = audioBufferToWavBlob(rendered);
      const base = sanitizeFileName(playable[0].name, 'hamburger-mix');
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${base}_hamburger_3d.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      if (closeDecodeCtx) {
        try {
          void decodeCtx.close();
        } catch {
          /* */
        }
      }
    }
  }

  dispose(): void {
    this.stop(true);
    this.buffers.clear();
  }
}
