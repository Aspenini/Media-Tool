/** Orbital (HRTF) audio player: source orbits the listener in real time. */

import { showNotification } from '../ui/notification.js';
import { audioBufferToWavBlob } from '../utils/wav.js';

type DistanceModel = 'inverse' | 'linear' | 'exponential';

interface OrbitalDom {
  fileInput: HTMLInputElement;
  fileName: HTMLElement;
  playBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  statusEl: HTMLElement;
  speedEl: HTMLInputElement;
  radiusEl: HTMLInputElement;
  heightEl: HTMLInputElement;
  dopplerEl: HTMLInputElement;
  distanceModelEl: HTMLSelectElement;
  speedVal: HTMLElement;
  radiusVal: HTMLElement;
  heightVal: HTMLElement;
  dopplerVal: HTMLElement;
  sourceDot: HTMLElement;
  orbitRing: SVGCircleElement;
  stage: HTMLElement;
  angleReadout: HTMLElement;
  dirReadout: HTMLElement;
  xzReadout: HTMLElement;
  playbackReadout: HTMLElement;
}

function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

export function initAudioSpinning(): void {
  const root = document.getElementById('audioSpinningTab');
  if (!root) return;

  const fileInput = root.querySelector<HTMLInputElement>('#asFileInput');
  const fileName = root.querySelector<HTMLElement>('#asFileName');
  const playBtn = root.querySelector<HTMLButtonElement>('#asPlayBtn');
  const pauseBtn = root.querySelector<HTMLButtonElement>('#asPauseBtn');
  const stopBtn = root.querySelector<HTMLButtonElement>('#asStopBtn');
  const downloadBtn = root.querySelector<HTMLButtonElement>('#asDownload3d');
  const statusEl = root.querySelector<HTMLElement>('#asStatus');

  const speedEl = root.querySelector<HTMLInputElement>('#asSpeed');
  const radiusEl = root.querySelector<HTMLInputElement>('#asRadius');
  const heightEl = root.querySelector<HTMLInputElement>('#asHeight');
  const dopplerEl = root.querySelector<HTMLInputElement>('#asDoppler');
  const distanceModelEl = root.querySelector<HTMLSelectElement>('#asDistanceModel');

  const speedVal = root.querySelector<HTMLElement>('#asSpeedVal');
  const radiusVal = root.querySelector<HTMLElement>('#asRadiusVal');
  const heightVal = root.querySelector<HTMLElement>('#asHeightVal');
  const dopplerVal = root.querySelector<HTMLElement>('#asDopplerVal');

  const sourceDot = root.querySelector<HTMLElement>('#asSourceDot');
  const orbitRing = root.querySelector<SVGCircleElement>('#asOrbitRing');
  const stage = root.querySelector<HTMLElement>('#asStage');

  const angleReadout = root.querySelector<HTMLElement>('#asAngleReadout');
  const dirReadout = root.querySelector<HTMLElement>('#asDirReadout');
  const xzReadout = root.querySelector<HTMLElement>('#asXzReadout');
  const playbackReadout = root.querySelector<HTMLElement>('#asPlaybackReadout');

  if (
    !fileInput ||
    !fileName ||
    !playBtn ||
    !pauseBtn ||
    !stopBtn ||
    !downloadBtn ||
    !statusEl ||
    !speedEl ||
    !radiusEl ||
    !heightEl ||
    !dopplerEl ||
    !distanceModelEl ||
    !speedVal ||
    !radiusVal ||
    !heightVal ||
    !dopplerVal ||
    !sourceDot ||
    !orbitRing ||
    !stage ||
    !angleReadout ||
    !dirReadout ||
    !xzReadout ||
    !playbackReadout
  ) {
    return;
  }

  bindOrbital({
    fileInput,
    fileName,
    playBtn,
    pauseBtn,
    stopBtn,
    downloadBtn,
    statusEl,
    speedEl,
    radiusEl,
    heightEl,
    dopplerEl,
    distanceModelEl,
    speedVal,
    radiusVal,
    heightVal,
    dopplerVal,
    sourceDot,
    orbitRing,
    stage,
    angleReadout,
    dirReadout,
    xzReadout,
    playbackReadout,
  });
}

function bindOrbital(dom: OrbitalDom): void {
  let audioCtx: AudioContext | null = null;
  let panner: PannerNode | null = null;
  let gainNode: GainNode | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let audioBuffer: AudioBuffer | null = null;

  let isPlaying = false;
  let isPaused = false;
  let startTime = 0;
  let pausedOffset = 0;
  let animFrame = 0;
  let lastMotionTime = 0;
  let lastX = 0;
  let lastZ = 0;

  function updateDisplayedValues(): void {
    dom.speedVal.textContent = Number(dom.speedEl.value).toFixed(2);
    dom.radiusVal.textContent = Number(dom.radiusEl.value).toFixed(2);
    dom.heightVal.textContent = Number(dom.heightEl.value).toFixed(2);
    dom.dopplerVal.textContent = Number(dom.dopplerEl.value).toFixed(2);
    dom.dirReadout.textContent = 'Clockwise';
    updateOrbitRing();
  }

  function updateOrbitRing(): void {
    const radius = Number(dom.radiusEl.value);
    const visualR = Math.max(10, Math.min(42, 10 + radius * 13));
    dom.orbitRing.setAttribute('r', visualR.toFixed(2));
  }

  [dom.speedEl, dom.radiusEl, dom.heightEl, dom.dopplerEl, dom.distanceModelEl].forEach((el) => {
    el.addEventListener('input', () => {
      updateDisplayedValues();
      if (panner) applyPannerSettings();
    });
    el.addEventListener('change', () => {
      updateDisplayedValues();
      if (panner) applyPannerSettings();
    });
  });

  function setStatus(text: string): void {
    dom.statusEl.textContent = text;
  }

  function ensureAudioContext(): void {
    if (!audioCtx) {
      const AC = getAudioContextClass();
      audioCtx = new AC();

      audioCtx.listener.positionX.value = 0;
      audioCtx.listener.positionY.value = 0;
      audioCtx.listener.positionZ.value = 0;
      audioCtx.listener.forwardX.value = 0;
      audioCtx.listener.forwardY.value = 0;
      audioCtx.listener.forwardZ.value = -1;
      audioCtx.listener.upX.value = 0;
      audioCtx.listener.upY.value = 1;
      audioCtx.listener.upZ.value = 0;

      panner = audioCtx.createPanner();
      gainNode = audioCtx.createGain();

      panner.panningModel = 'HRTF';
      panner.positionX.value = 0;
      panner.positionY.value = 0;
      panner.positionZ.value = -1;
      syncPannerFromUi(panner, audioCtx);

      panner.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    }
  }

  function syncPannerFromUi(p: PannerNode, ctx: BaseAudioContext): void {
    p.distanceModel = dom.distanceModelEl.value as DistanceModel;
    p.refDistance = 1;
    p.maxDistance = 10000;
    p.rolloffFactor = 0.6;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.coneOuterGain = 1;
    p.orientationX.value = 0;
    p.orientationY.value = 0;
    p.orientationZ.value = 0;
    const listener = ctx.listener as AudioListener & { dopplerFactor?: number; speedOfSound?: number };
    if ('dopplerFactor' in listener) {
      listener.dopplerFactor = Number(dom.dopplerEl.value);
    }
    if ('speedOfSound' in listener) {
      listener.speedOfSound = 343.3;
    }
  }

  function applyPannerSettings(): void {
    if (!panner || !audioCtx) return;
    syncPannerFromUi(panner, audioCtx);
  }

  function scheduleOrbitPath(
    panner: PannerNode,
    duration: number,
    speedRps: number,
    radius: number,
    height: number,
  ): void {
    const maxKf = 10000;
    const desired = Math.ceil(duration * 72);
    const n = Math.min(maxKf, Math.max(12, desired));
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * duration;
      const angle = t * speedRps * Math.PI * 2;
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
  }

  async function downloadSpatialWav(): Promise<void> {
    if (!audioBuffer) {
      showNotification('Load an audio file first.', 'error');
      return;
    }
    const buffer = audioBuffer;
    const duration = buffer.duration;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    if (!Number.isFinite(duration) || duration <= 0 || length <= 0) {
      showNotification('Invalid audio buffer.', 'error');
      return;
    }

    dom.downloadBtn.disabled = true;
    setStatus('Rendering binaural (3D) mix… This can take a while for long files.');
    try {
      const offline = new OfflineAudioContext(2, length, sampleRate);

      offline.listener.positionX.value = 0;
      offline.listener.positionY.value = 0;
      offline.listener.positionZ.value = 0;
      offline.listener.forwardX.value = 0;
      offline.listener.forwardY.value = 0;
      offline.listener.forwardZ.value = -1;
      offline.listener.upX.value = 0;
      offline.listener.upY.value = 1;
      offline.listener.upZ.value = 0;

      const offlinePanner = offline.createPanner();
      offlinePanner.panningModel = 'HRTF';
      syncPannerFromUi(offlinePanner, offline);

      const speedRps = Number(dom.speedEl.value);
      const radius = Number(dom.radiusEl.value);
      const height = Number(dom.heightEl.value);

      scheduleOrbitPath(offlinePanner, duration, speedRps, radius, height);

      const src = offline.createBufferSource();
      src.buffer = buffer;
      src.connect(offlinePanner);
      offlinePanner.connect(offline.destination);

      src.start(0);
      const rendered = await offline.startRendering();
      const blob = audioBufferToWavBlob(rendered);

      const raw = (dom.fileName.textContent || 'orbit-audio').trim();
      const base =
        raw === 'No file loaded.' ? 'orbit-audio' : raw.replace(/\.[^.]+$/, '') || 'orbit-audio';
      const safe = base.replace(/[<>:"/\\|?*]+/g, '-').slice(0, 120) || 'orbit-audio';

      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${safe}_3d.wav`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus('Saved binaural WAV (stereo). Use headphones when playing it back.');
    } catch (err) {
      console.error(err);
      showNotification('Could not render 3D audio. Try a shorter file or another format.', 'error');
      setStatus('Render failed.');
    } finally {
      dom.downloadBtn.disabled = false;
    }
  }

  function stopSourceNode(): void {
    if (sourceNode) {
      try {
        sourceNode.stop();
      } catch {
        /* already stopped */
      }
      try {
        sourceNode.disconnect();
      } catch {
        /* disconnected */
      }
      sourceNode = null;
    }
  }

  function createAndStartSource(offset = 0): void {
    if (!audioCtx || !audioBuffer || !panner) return;
    stopSourceNode();
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(panner);
    sourceNode.onended = () => {
      if (isPlaying && !isPaused) {
        cancelAnimationFrame(animFrame);
        isPlaying = false;
        isPaused = false;
        pausedOffset = 0;
        dom.playbackReadout.textContent = 'Stopped';
        setStatus('Playback finished.');
        dom.playBtn.disabled = false;
        dom.pauseBtn.disabled = true;
        dom.stopBtn.disabled = true;
      }
    };
    sourceNode.start(0, offset);
    startTime = audioCtx.currentTime - offset;
  }

  function getPlaybackOffset(): number {
    if (!audioCtx) return 0;
    if (isPlaying && !isPaused) {
      return audioCtx.currentTime - startTime;
    }
    return pausedOffset;
  }

  function setSourcePosition(x: number, y: number, z: number): void {
    if (!panner || !audioCtx) return;
    const now = audioCtx.currentTime;
    const dt = Math.max(0.0001, now - lastMotionTime);
    const vx = (x - lastX) / dt;
    const vz = (z - lastZ) / dt;

    panner.positionX.setValueAtTime(x, now);
    panner.positionY.setValueAtTime(y, now);
    panner.positionZ.setValueAtTime(z, now);

    const pannerWithVel = panner as PannerNode & { setVelocity?: (x: number, y: number, z: number) => void };
    pannerWithVel.setVelocity?.(vx, 0, vz);

    lastMotionTime = now;
    lastX = x;
    lastZ = z;
  }

  function animate(): void {
    if (!isPlaying || isPaused || !audioCtx) return;

    const t = getPlaybackOffset();
    const speed = Number(dom.speedEl.value);
    const radius = Number(dom.radiusEl.value);
    const y = Number(dom.heightEl.value);
    const angle = t * speed * Math.PI * 2;

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    setSourcePosition(x, y, z);
    renderSourceDot(x, z, radius);
    renderReadouts(angle, x, z);

    animFrame = requestAnimationFrame(animate);
  }

  function renderReadouts(angle: number, x: number, z: number): void {
    let deg = angle * (180 / Math.PI);
    deg = ((deg % 360) + 360) % 360;
    dom.angleReadout.textContent = `${deg.toFixed(0)}°`;
    dom.xzReadout.textContent = `${x.toFixed(2)} / ${z.toFixed(2)}`;
    dom.playbackReadout.textContent = isPaused ? 'Paused' : isPlaying ? 'Playing' : 'Stopped';
  }

  function renderSourceDot(x: number, z: number, radius: number): void {
    const rect = dom.stage.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxVisualR = Math.min(rect.width, rect.height) * 0.38;
    const scale = (maxVisualR / Math.max(radius, 0.05)) * 0.95;
    const px = cx + x * scale;
    const py = cy + z * scale;

    dom.sourceDot.style.left = `${px}px`;
    dom.sourceDot.style.top = `${py}px`;

    const depthGlow = 18 + Math.max(0, -z) * 5;
    dom.sourceDot.style.boxShadow = `0 0 ${depthGlow}px rgba(96, 165, 250, 0.85)`;
    dom.sourceDot.style.transform = `translate(-50%, -50%) scale(${1 + Math.max(0, -z) * 0.03})`;
  }

  async function loadFile(file: File): Promise<void> {
    try {
      ensureAudioContext();
      if (!audioCtx) return;
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      dom.fileName.textContent = file.name;
      dom.playBtn.disabled = false;
      dom.downloadBtn.disabled = false;
      setStatus('Loaded. Press Play to start orbiting audio.');
    } catch (err) {
      console.error(err);
      audioBuffer = null;
      dom.playBtn.disabled = true;
      dom.downloadBtn.disabled = true;
      setStatus('Could not decode that audio file in this browser. Try MP3, WAV, M4A, or OGG.');
    }
  }

  dom.fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    stopAll();
    await loadFile(file);
  });

  async function startPlayback(): Promise<void> {
    if (!audioBuffer) return;
    ensureAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    createAndStartSource(pausedOffset);
    isPlaying = true;
    isPaused = false;
    dom.playBtn.disabled = true;
    dom.pauseBtn.disabled = false;
    dom.stopBtn.disabled = false;
    dom.playbackReadout.textContent = 'Playing';
    setStatus('Orbiting audio is playing. Use headphones for the full effect.');

    lastMotionTime = audioCtx.currentTime;
    const seedAngle = pausedOffset * Number(dom.speedEl.value) * Math.PI * 2;
    const seedX = Math.cos(seedAngle) * Number(dom.radiusEl.value);
    const seedZ = Math.sin(seedAngle) * Number(dom.radiusEl.value);
    lastX = seedX;
    lastZ = seedZ;
    setSourcePosition(seedX, Number(dom.heightEl.value), seedZ);
    renderSourceDot(seedX, seedZ, Number(dom.radiusEl.value));
    renderReadouts(seedAngle, seedX, seedZ);
    cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(animate);
  }

  function pausePlayback(): void {
    if (!isPlaying || isPaused) return;
    pausedOffset = getPlaybackOffset();
    isPaused = true;
    isPlaying = false;
    stopSourceNode();
    cancelAnimationFrame(animFrame);
    dom.playBtn.disabled = false;
    dom.pauseBtn.disabled = true;
    dom.stopBtn.disabled = false;
    dom.playbackReadout.textContent = 'Paused';
    setStatus('Paused. Press Play to continue from the same point.');
  }

  function stopAll(): void {
    if (audioCtx && isPlaying) {
      pausedOffset = 0;
    }
    isPlaying = false;
    isPaused = false;
    pausedOffset = 0;
    stopSourceNode();
    cancelAnimationFrame(animFrame);
    dom.playBtn.disabled = !audioBuffer;
    dom.pauseBtn.disabled = true;
    dom.stopBtn.disabled = true;
    dom.playbackReadout.textContent = 'Stopped';
    dom.angleReadout.textContent = '0°';
    dom.xzReadout.textContent = '0.00 / 0.00';
    renderSourceDot(0, -Number(dom.radiusEl.value), Number(dom.radiusEl.value));
    setStatus(audioBuffer ? 'Stopped. Ready to play again.' : 'Load a file to begin.');
  }

  dom.playBtn.addEventListener('click', () => {
    void startPlayback();
  });
  dom.pauseBtn.addEventListener('click', pausePlayback);
  dom.stopBtn.addEventListener('click', stopAll);
  dom.downloadBtn.addEventListener('click', () => {
    void downloadSpatialWav();
  });

  window.addEventListener('resize', () => {
    renderSourceDot(lastX, lastZ, Number(dom.radiusEl.value));
  });

  updateDisplayedValues();
  renderSourceDot(0, -Number(dom.radiusEl.value), Number(dom.radiusEl.value));
}
