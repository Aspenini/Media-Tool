import { audioBufferToWavBlob } from './wav';
import { getAudioContextClass, resetListener, sanitizeFileName, type DistanceModel } from './spatial';

export interface OrbitalParams {
  speed: number;
  radius: number;
  height: number;
  doppler: number;
  distanceModel: DistanceModel;
  echo: number;
  echoDelayMs: number;
  echoLinkDistance: boolean;
  volume: number;
  radiusMin: number;
  radiusMax: number;
}

export interface OrbitalTick {
  angleDeg: number;
  x: number;
  z: number;
  playback: 'Playing' | 'Paused' | 'Stopped';
}

export type PlaybackState = 'Playing' | 'Paused' | 'Stopped';

/** Real-time HRTF orbital audio player: the source circles the listener. */
export class OrbitalEngine {
  private ctx: AudioContext | null = null;
  private panner: PannerNode | null = null;
  private gain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;

  private playing = false;
  private paused = false;
  private startTime = 0;
  private pausedOffset = 0;
  private animFrame = 0;
  private lastMotionTime = 0;
  private lastX = 0;
  private lastZ = 0;
  private fileName = 'orbit-audio';

  private params: OrbitalParams;
  private onTick: (tick: OrbitalTick) => void;
  private onState: (state: PlaybackState) => void;

  constructor(params: OrbitalParams, onTick: (tick: OrbitalTick) => void, onState: (state: PlaybackState) => void) {
    this.params = params;
    this.onTick = onTick;
    this.onState = onState;
  }

  setParams(params: OrbitalParams): void {
    this.params = params;
    if (this.panner && this.ctx) this.syncPanner();
    this.syncEchoAndVolume();
  }

  private readEchoDelaySec(): number {
    const p = this.params;
    if (p.echoLinkDistance) {
      const span = p.radiusMax - p.radiusMin || 1;
      const u = Math.min(1, Math.max(0, (p.radius - p.radiusMin) / span));
      return 0.03 + u * 0.52;
    }
    return p.echoDelayMs / 1000;
  }

  private syncEchoAndVolume(): void {
    if (!this.delay || !this.dryGain || !this.wetGain || !this.gain) return;
    const mix = Math.min(1, Math.max(0, this.params.echo));
    this.delay.delayTime.value = Math.min(0.99, Math.max(0.001, this.readEchoDelaySec()));
    this.dryGain.gain.value = 1 - mix;
    this.wetGain.gain.value = mix;
    this.gain.gain.value = Math.min(2, Math.max(0, this.params.volume));
  }

  private syncPanner(): void {
    if (!this.panner || !this.ctx) return;
    const p = this.panner;
    p.distanceModel = this.params.distanceModel;
    p.refDistance = 1;
    p.maxDistance = 10000;
    p.rolloffFactor = 0.6;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.coneOuterGain = 1;
    p.orientationX.value = 0;
    p.orientationY.value = 0;
    p.orientationZ.value = 0;
    const listener = this.ctx.listener as AudioListener & { dopplerFactor?: number; speedOfSound?: number };
    if ('dopplerFactor' in listener) listener.dopplerFactor = this.params.doppler;
    if ('speedOfSound' in listener) listener.speedOfSound = 343.3;
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const AC = getAudioContextClass();
    this.ctx = new AC();
    resetListener(this.ctx.listener);

    this.panner = this.ctx.createPanner();
    this.gain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.delay = this.ctx.createDelay(1.0);

    this.panner.panningModel = 'HRTF';
    this.panner.positionX.value = 0;
    this.panner.positionY.value = 0;
    this.panner.positionZ.value = -1;
    this.syncPanner();

    this.panner.connect(this.dryGain);
    this.dryGain.connect(this.gain);
    this.panner.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.wetGain.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    this.syncEchoAndVolume();
  }

  async load(file: File): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;
    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    this.fileName = sanitizeFileName(file.name, 'orbit-audio');
    this.syncEchoAndVolume();
  }

  hasBuffer(): boolean {
    return this.buffer !== null;
  }

  private setSourcePosition(x: number, y: number, z: number): void {
    if (!this.panner || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dt = Math.max(0.0001, now - this.lastMotionTime);
    const vx = (x - this.lastX) / dt;
    const vz = (z - this.lastZ) / dt;
    this.panner.positionX.setValueAtTime(x, now);
    this.panner.positionY.setValueAtTime(y, now);
    this.panner.positionZ.setValueAtTime(z, now);
    const withVel = this.panner as PannerNode & { setVelocity?: (x: number, y: number, z: number) => void };
    withVel.setVelocity?.(vx, 0, vz);
    this.lastMotionTime = now;
    this.lastX = x;
    this.lastZ = z;
  }

  private getOffset(): number {
    if (!this.ctx) return 0;
    if (this.playing && !this.paused) return this.ctx.currentTime - this.startTime;
    return this.pausedOffset;
  }

  private animate = (): void => {
    if (!this.playing || this.paused || !this.ctx) return;
    const t = this.getOffset();
    const { speed, radius, height } = this.params;
    const angle = t * speed * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    this.setSourcePosition(x, height, z);
    let deg = angle * (180 / Math.PI);
    deg = ((deg % 360) + 360) % 360;
    this.onTick({ angleDeg: deg, x, z, playback: 'Playing' });
    this.animFrame = requestAnimationFrame(this.animate);
  };

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* */
      }
      try {
        this.source.disconnect();
      } catch {
        /* */
      }
      this.source = null;
    }
  }

  async play(): Promise<void> {
    if (!this.buffer) return;
    this.ensureContext();
    if (!this.ctx || !this.panner) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.stopSource();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.panner);
    this.source.onended = () => {
      if (this.playing && !this.paused) {
        cancelAnimationFrame(this.animFrame);
        this.playing = false;
        this.paused = false;
        this.pausedOffset = 0;
        this.onState('Stopped');
      }
    };
    this.source.start(0, this.pausedOffset);
    this.startTime = this.ctx.currentTime - this.pausedOffset;

    this.playing = true;
    this.paused = false;
    this.onState('Playing');

    this.lastMotionTime = this.ctx.currentTime;
    cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(this.animate);
  }

  pause(): void {
    if (!this.playing || this.paused) return;
    this.pausedOffset = this.getOffset();
    this.paused = true;
    this.playing = false;
    this.stopSource();
    cancelAnimationFrame(this.animFrame);
    this.onState('Paused');
  }

  stop(): void {
    this.playing = false;
    this.paused = false;
    this.pausedOffset = 0;
    this.stopSource();
    cancelAnimationFrame(this.animFrame);
    this.onState('Stopped');
    this.onTick({ angleDeg: 0, x: 0, z: -this.params.radius, playback: 'Stopped' });
  }

  async downloadWav(): Promise<void> {
    if (!this.buffer) throw new Error('No audio loaded');
    const { duration, length, sampleRate } = this.buffer;
    if (!Number.isFinite(duration) || duration <= 0 || length <= 0) throw new Error('Invalid audio buffer');

    const offline = new OfflineAudioContext(2, length, sampleRate);
    resetListener(offline.listener);

    const panner = offline.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = this.params.distanceModel;
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 0.6;

    const { speed, radius, height } = this.params;
    const n = Math.min(10000, Math.max(12, Math.ceil(duration * 72)));
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * duration;
      const angle = t * speed * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (i === 0) {
        panner.positionX.setValueAtTime(x, t);
        panner.positionY.setValueAtTime(height, t);
        panner.positionZ.setValueAtTime(z, t);
      } else {
        panner.positionX.linearRampToValueAtTime(x, t);
        panner.positionY.linearRampToValueAtTime(height, t);
        panner.positionZ.linearRampToValueAtTime(z, t);
      }
    }

    const dry = offline.createGain();
    const wet = offline.createGain();
    const del = offline.createDelay(1.0);
    const master = offline.createGain();
    const mix = Math.min(1, Math.max(0, this.params.echo));
    del.delayTime.value = Math.min(0.99, Math.max(0.001, this.readEchoDelaySec()));
    dry.gain.value = 1 - mix;
    wet.gain.value = mix;
    master.gain.value = Math.min(2, Math.max(0, this.params.volume));

    const src = offline.createBufferSource();
    src.buffer = this.buffer;
    src.connect(panner);
    panner.connect(dry);
    dry.connect(master);
    panner.connect(del);
    del.connect(wet);
    wet.connect(master);
    master.connect(offline.destination);
    src.start(0);

    const rendered = await offline.startRendering();
    const blob = audioBufferToWavBlob(rendered);
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${this.fileName}_3d.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
