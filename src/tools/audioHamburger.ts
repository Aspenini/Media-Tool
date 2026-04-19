/**
 * Audio Hamburger — play every track at once in 3D space.
 * Each track has a draggable position around the listener (azimuth, distance, height).
 */

import { showNotification } from '../ui/notification.js';
import { audioBufferToWavBlob } from '../utils/wav.js';

type QueuedTrack = {
  id: string;
  file: File;
  name: string;
  buffer: AudioBuffer | null;
  /** radians; 0 = straight ahead (-Z in Web Audio listener space) */
  panAzimuth: number;
  panDistance: number;
  panHeight: number;
};

type ActiveLayer = {
  id: string;
  source: AudioBufferSourceNode;
  panner: PannerNode;
};

const MIN_PAN_DIST = 0.82;
const MAX_PAN_DIST = 4.48;
const MIN_PAN_HEIGHT = -2.35;
const MAX_PAN_HEIGHT = 2.5;
const WORLD_R_FOR_SCALE = 2.5;
/** Hard left / right when “one per side” is enabled (exactly two tracks). */
const ONE_PER_SIDE_DIST = 2.35;
const AZIMUTH_LEFT = -Math.PI / 2;
const AZIMUTH_RIGHT = Math.PI / 2;

function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

function newTrackId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function worldFromPan(azimuth: number, distance: number, height: number): { x: number; y: number; z: number } {
  const x = Math.sin(azimuth) * distance;
  const z = -Math.cos(azimuth) * distance;
  return { x, y: height, z };
}

/** Spread new tracks in a shallow arc in front of the listener. */
function defaultPanForIndex(index: number, total: number): Pick<QueuedTrack, 'panAzimuth' | 'panDistance' | 'panHeight'> {
  if (total <= 1) return { panAzimuth: 0, panDistance: 2.2, panHeight: 0 };
  const spread = Math.PI * 0.72;
  const u = index / (total - 1);
  const panAzimuth = (u - 0.5) * spread;
  return { panAzimuth, panDistance: 2.2, panHeight: 0 };
}

function dotHue(index: number, n: number): string {
  const h = (index / Math.max(1, n)) * 280 + 180;
  return `hsl(${h} 78% 58%)`;
}

export function initAudioHamburger(): void {
  const root = document.getElementById('audioHamburgerTab');
  if (!root) return;

  const fileInput = root.querySelector<HTMLInputElement>('#ahFileInput');
  const queueList = root.querySelector<HTMLUListElement>('#ahQueueList');
  const queueEmpty = root.querySelector<HTMLElement>('#ahQueueEmpty');
  const queueCount = root.querySelector<HTMLElement>('#ahQueueCount');
  const playBtn = root.querySelector<HTMLButtonElement>('#ahPlayBtn');
  const pauseBtn = root.querySelector<HTMLButtonElement>('#ahPauseBtn');
  const stopBtn = root.querySelector<HTMLButtonElement>('#ahStopBtn');
  const downloadBtn = root.querySelector<HTMLButtonElement>('#ahDownloadBtn');
  const statusEl = root.querySelector<HTMLElement>('#ahStatus');
  const volumeEl = root.querySelector<HTMLInputElement>('#ahVolume');
  const volumeVal = root.querySelector<HTMLElement>('#ahVolumeVal');
  const stage = root.querySelector<HTMLElement>('#ahStage');
  const dotsEl = root.querySelector<HTMLElement>('#ahDots');
  const twoTrackRow = root.querySelector<HTMLElement>('#ahTwoTrackControls');
  const onePerSideCheckbox = root.querySelector<HTMLInputElement>('#ahOnePerSide');
  const swapSidesBtn = root.querySelector<HTMLButtonElement>('#ahSwapSides');
  const twoTrackHint = root.querySelector<HTMLElement>('#ahTwoTrackHint');

  if (
    !fileInput ||
    !queueList ||
    !queueEmpty ||
    !queueCount ||
    !playBtn ||
    !pauseBtn ||
    !stopBtn ||
    !downloadBtn ||
    !statusEl ||
    !volumeEl ||
    !volumeVal ||
    !stage ||
    !dotsEl ||
    !twoTrackRow ||
    !onePerSideCheckbox ||
    !swapSidesBtn ||
    !twoTrackHint
  ) {
    return;
  }

  const el = {
    fileInput,
    queueList,
    queueEmpty,
    queueCount,
    playBtn,
    pauseBtn,
    stopBtn,
    downloadBtn,
    statusEl,
    volumeEl,
    volumeVal,
    stage,
    dotsEl,
    twoTrackRow,
    onePerSideCheckbox,
    swapSidesBtn,
    twoTrackHint,
  };

  const queue: QueuedTrack[] = [];
  let audioCtx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let activeLayers: ActiveLayer[] = [];
  /** True between Play and Stop; pause uses context suspend. */
  let sessionActive = false;
  let endedCount = 0;
  let dragSourceId: string | null = null;
  let exportInProgress = false;
  let draggingTrackId: string | null = null;
  /** With exactly two tracks: lock first/second to L/R on the map. */
  let onePerSideMode = false;
  /** When one per side: flip which list row maps to which ear. */
  let twoTrackSwapped = false;

  function setStatus(text: string): void {
    el.statusEl.textContent = text;
  }

  function perLayerGainScalar(n: number): number {
    if (n <= 1) return 1;
    return 1 / Math.sqrt(n);
  }

  function syncVolumeDisplay(): void {
    el.volumeVal.textContent = String(Math.round(Number(el.volumeEl.value) * 100));
    if (masterGain && audioCtx) {
      masterGain.gain.value =
        Number(el.volumeEl.value) * perLayerGainScalar(activeLayers.length || queue.length || 1);
    }
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
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      syncVolumeDisplay();
    }
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
    p.orientationX.value = 0;
    p.orientationY.value = 0;
    p.orientationZ.value = 0;
  }

  function getStageLayout(): { cx: number; cy: number; scale: number } | null {
    const rect = el.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const maxR = Math.min(rect.width, rect.height) * 0.36;
    const scale = (maxR / WORLD_R_FOR_SCALE) * 0.92;
    return { cx: rect.width / 2, cy: rect.height / 2, scale };
  }

  function applyOnePerSideLayout(): void {
    if (queue.length !== 2 || !onePerSideMode) return;
    const [t0, t1] = queue;
    if (twoTrackSwapped) {
      t0!.panAzimuth = AZIMUTH_RIGHT;
      t0!.panDistance = ONE_PER_SIDE_DIST;
      t0!.panHeight = 0;
      t1!.panAzimuth = AZIMUTH_LEFT;
      t1!.panDistance = ONE_PER_SIDE_DIST;
      t1!.panHeight = 0;
    } else {
      t0!.panAzimuth = AZIMUTH_LEFT;
      t0!.panDistance = ONE_PER_SIDE_DIST;
      t0!.panHeight = 0;
      t1!.panAzimuth = AZIMUTH_RIGHT;
      t1!.panDistance = ONE_PER_SIDE_DIST;
      t1!.panHeight = 0;
    }
    renderDots();
    syncPannersFromQueue();
  }

  function syncTwoTrackUi(): void {
    const two = queue.length === 2;
    el.twoTrackRow.hidden = !two;
    el.twoTrackHint.hidden = !two;
    if (!two) {
      onePerSideMode = false;
      twoTrackSwapped = false;
      el.onePerSideCheckbox.checked = false;
      el.swapSidesBtn.disabled = true;
      el.stage.classList.remove('ah-stage-sides-locked');
      return;
    }
    el.onePerSideCheckbox.checked = onePerSideMode;
    el.swapSidesBtn.disabled = !onePerSideMode;
    el.stage.classList.toggle('ah-stage-sides-locked', onePerSideMode);
  }

  function syncPannersFromQueue(): void {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (const track of queue) {
      const layer = activeLayers.find((l) => l.id === track.id);
      if (!layer) continue;
      const { x, y, z } = worldFromPan(track.panAzimuth, track.panDistance, track.panHeight);
      layer.panner.positionX.setValueAtTime(x, now);
      layer.panner.positionY.setValueAtTime(y, now);
      layer.panner.positionZ.setValueAtTime(z, now);
    }
  }

  function applyPointerToTrackPan(track: QueuedTrack, clientX: number, clientY: number): void {
    const rect = el.stage.getBoundingClientRect();
    const layout = getStageLayout();
    if (!layout) return;
    const { cx, cy, scale } = layout;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const yHold = track.panHeight;
    const x = (px - cx) / scale;
    const z = (py - cy) / scale + yHold * 0.22;
    let dist = Math.hypot(x, z);
    if (dist < MIN_PAN_DIST) dist = MIN_PAN_DIST;
    if (dist > MAX_PAN_DIST) dist = MAX_PAN_DIST;
    track.panAzimuth = Math.atan2(x, -z);
    track.panDistance = dist;
  }

  /** Reconcile dot elements with queue so pointer capture survives moves (no full innerHTML wipe). */
  function renderDots(): void {
    const layout = getStageLayout();
    if (!layout) return;
    if (!queue.length) {
      el.dotsEl.innerHTML = '';
      return;
    }
    const { cx, cy, scale } = layout;
    const n = queue.length;
    const existing = new Map<string, HTMLElement>();
    for (const node of el.dotsEl.querySelectorAll<HTMLElement>('.ah-dot')) {
      if (node.dataset.id) existing.set(node.dataset.id, node);
    }

    queue.forEach((track, index) => {
      let dot = existing.get(track.id);
      if (!dot) {
        dot = document.createElement('div');
        dot.className = 'ah-dot';
        dot.dataset.id = track.id;
        dot.tabIndex = 0;
        el.dotsEl.appendChild(dot);
      }
      existing.delete(track.id);
      dot.title = `${track.name} — drag for direction & distance; wheel for height`;
      dot.style.background = dotHue(index, n);
      dot.style.zIndex = String(10 + index);
      const { x, y, z } = worldFromPan(track.panAzimuth, track.panDistance, track.panHeight);
      const px = cx + x * scale;
      const py = cy + z * scale - y * (scale * 0.22);
      dot.style.left = `${px}px`;
      dot.style.top = `${py}px`;
      const depth = -z;
      const glow = 10 + Math.min(22, Math.max(0, depth) * 3.5);
      dot.style.boxShadow = `0 0 ${glow}px rgba(0, 0, 0, 0.5)`;
    });
    existing.forEach((node) => node.remove());
  }

  function refreshSpatialVisual(): void {
    renderDots();
  }

  function onStageDragMove(ev: PointerEvent): void {
    if (!draggingTrackId) return;
    const track = queue.find((q) => q.id === draggingTrackId);
    if (!track) return;
    applyPointerToTrackPan(track, ev.clientX, ev.clientY);
    renderDots();
    syncPannersFromQueue();
  }

  function onStageDragEnd(ev: PointerEvent): void {
    document.removeEventListener('pointermove', onStageDragMove);
    document.removeEventListener('pointerup', onStageDragEnd);
    document.removeEventListener('pointercancel', onStageDragEnd);
    const id = draggingTrackId;
    draggingTrackId = null;
    if (id) {
      const dot = el.dotsEl.querySelector<HTMLElement>(`.ah-dot[data-id="${id}"]`);
      if (dot?.hasPointerCapture(ev.pointerId)) {
        dot.releasePointerCapture(ev.pointerId);
      }
      dot?.classList.remove('ah-dot-dragging');
    }
    renderDots();
  }

  function abortDotsDrag(): void {
    document.removeEventListener('pointermove', onStageDragMove);
    document.removeEventListener('pointerup', onStageDragEnd);
    document.removeEventListener('pointercancel', onStageDragEnd);
    draggingTrackId = null;
    el.dotsEl.querySelectorAll('.ah-dot.ah-dot-dragging').forEach((n) => n.classList.remove('ah-dot-dragging'));
  }

  function teardownGraph(): void {
    abortDotsDrag();
    sessionActive = false;
    for (const layer of activeLayers) {
      layer.source.onended = null;
      try {
        layer.source.stop();
      } catch {
        /* already stopped */
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
    activeLayers = [];
    endedCount = 0;
    if (masterGain) {
      try {
        masterGain.disconnect();
      } catch {
        /* */
      }
      masterGain = null;
    }
    if (audioCtx) {
      try {
        void audioCtx.close();
      } catch {
        /* */
      }
      audioCtx = null;
    }
    el.dotsEl.innerHTML = '';
  }

  function stopPlayback(resetContext: boolean): void {
    abortDotsDrag();
    sessionActive = false;
    for (const layer of activeLayers) {
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
    activeLayers = [];
    endedCount = 0;
    if (audioCtx?.state === 'suspended') {
      void audioCtx.resume();
    }
    if (resetContext) {
      teardownGraph();
    } else if (masterGain && audioCtx) {
      try {
        masterGain.disconnect();
      } catch {
        /* */
      }
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      syncVolumeDisplay();
    }
    el.dotsEl.innerHTML = '';
    updateTransport();
  }

  function updateTransport(): void {
    const hasTracks = queue.length > 0;
    const playing = sessionActive && audioCtx?.state === 'running';
    const paused = sessionActive && audioCtx?.state === 'suspended';
    el.playBtn.disabled = !hasTracks || playing || exportInProgress;
    el.pauseBtn.disabled = !sessionActive || paused || exportInProgress;
    el.stopBtn.disabled = !hasTracks || !sessionActive || exportInProgress;
    el.downloadBtn.disabled = !hasTracks || exportInProgress;
  }

  async function downloadMixWav(): Promise<void> {
    if (!queue.length || exportInProgress) return;

    const decodeCtx = audioCtx ?? new (getAudioContextClass())();
    const closeDecodeCtx = !audioCtx;

    exportInProgress = true;
    updateTransport();
    el.downloadBtn.textContent = 'Rendering…';
    setStatus('Rendering binaural mix (offline). Large mixes take longer…');

    try {
      for (const t of queue) {
        if (t.buffer) continue;
        try {
          const ab = await t.file.arrayBuffer();
          t.buffer = await decodeCtx.decodeAudioData(ab.slice(0));
        } catch (err) {
          console.error(err);
          showNotification(`Could not decode: ${t.name}. Skipping for export.`, 'error');
          t.buffer = null;
        }
      }

      const playable = queue.filter((t) => t.buffer);
      if (!playable.length) {
        showNotification('No decodable tracks to export.', 'error');
        setStatus('Nothing to download.');
        return;
      }

      const sampleRate = Math.max(...playable.map((t) => t.buffer!.sampleRate));
      const maxDur = Math.max(...playable.map((t) => t.buffer!.duration));
      if (!Number.isFinite(maxDur) || maxDur <= 0) {
        showNotification('Invalid audio length.', 'error');
        return;
      }

      const length = Math.max(1, Math.ceil(maxDur * sampleRate));
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

      const master = offline.createGain();
      const nPlay = playable.length;
      master.gain.value = Number(el.volumeEl.value) * perLayerGainScalar(nPlay);
      master.connect(offline.destination);

      for (const track of queue) {
        if (!track.buffer) continue;
        const panner = offline.createPanner();
        configurePanner(panner);
        const { x, y, z } = worldFromPan(track.panAzimuth, track.panDistance, track.panHeight);
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
        const src = offline.createBufferSource();
        src.buffer = track.buffer;
        src.connect(panner);
        panner.connect(master);
        src.start(0);
      }

      const rendered = await offline.startRendering();
      const blob = audioBufferToWavBlob(rendered);
      const raw = queue.find((t) => t.buffer)?.name ?? 'hamburger-mix';
      const base = raw.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]+/g, '-').slice(0, 120) || 'hamburger-mix';

      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${base}_hamburger_3d.wav`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus('Saved stereo binaural WAV (same positions as on the map). Use headphones when playing it back.');
    } catch (err) {
      console.error(err);
      showNotification('Could not render the mix. Try shorter files or fewer layers.', 'error');
      setStatus('Export failed.');
    } finally {
      if (closeDecodeCtx) {
        try {
          void decodeCtx.close();
        } catch {
          /* */
        }
      }
      exportInProgress = false;
      el.downloadBtn.textContent = 'Download mix (WAV)';
      updateTransport();
    }
  }

  function renderQueueUi(): void {
    el.queueCount.textContent = String(queue.length);
    el.queueEmpty.style.display = queue.length ? 'none' : 'block';
    el.queueList.innerHTML = '';

    queue.forEach((track) => {
      const li = document.createElement('li');
      li.className = 'ah-queue-item';
      li.dataset.id = track.id;

      const grip = document.createElement('span');
      grip.className = 'ah-drag';
      grip.draggable = true;
      grip.textContent = '⋮⋮';
      grip.title = 'Drag to reorder list (draw order on map)';
      grip.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'ah-queue-name';
      name.textContent = track.name;
      name.title = track.name;

      const actions = document.createElement('div');
      actions.className = 'ah-queue-actions';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'secondary';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.dataset.action = 'remove';
      removeBtn.dataset.id = track.id;
      actions.appendChild(removeBtn);

      li.appendChild(grip);
      li.appendChild(name);
      li.appendChild(actions);
      el.queueList.appendChild(li);
    });

    syncTwoTrackUi();
    if (queue.length === 2 && onePerSideMode) {
      applyOnePerSideLayout();
    } else {
      refreshSpatialVisual();
    }
    updateTransport();
  }

  function onLayerEnded(): void {
    if (!sessionActive) return;
    endedCount += 1;
    if (endedCount >= activeLayers.length) {
      stopPlayback(true);
      setStatus('Playback finished.');
      renderQueueUi();
      updateTransport();
    }
  }

  async function startAllLayers(): Promise<void> {
    if (!queue.length) return;
    ensureAudioContext();
    if (!audioCtx || !masterGain) return;

    if (audioCtx.state === 'suspended' && activeLayers.length) {
      await audioCtx.resume();
      setStatus('Playing.');
      updateTransport();
      return;
    }

    stopPlayback(false);

    ensureAudioContext();
    if (!audioCtx || !masterGain) return;

    const toDecode = queue.filter((t) => !t.buffer);
    for (const t of toDecode) {
      try {
        const ab = await t.file.arrayBuffer();
        t.buffer = await audioCtx.decodeAudioData(ab.slice(0));
      } catch (err) {
        console.error(err);
        showNotification(`Could not decode: ${t.name}. Skipping.`, 'error');
        t.buffer = null;
      }
    }

    const playable = queue.filter((t) => t.buffer);
    if (!playable.length) {
      setStatus('No decodable tracks.');
      updateTransport();
      return;
    }

    endedCount = 0;
    sessionActive = true;
    const n = playable.length;
    const t0 = audioCtx.currentTime;

    playable.forEach((track) => {
      const buf = track.buffer!;
      const panner = audioCtx!.createPanner();
      configurePanner(panner);
      const src = audioCtx!.createBufferSource();
      src.buffer = buf;
      src.connect(panner);
      panner.connect(masterGain!);
      const { x, y, z } = worldFromPan(track.panAzimuth, track.panDistance, track.panHeight);
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
      src.onended = onLayerEnded;
      src.start(t0);
      activeLayers.push({ id: track.id, source: src, panner });
    });

    syncVolumeDisplay();
    setStatus(n === 1 ? 'Playing one layer.' : `Playing ${n} layers at once.`);
    refreshSpatialVisual();
    updateTransport();
  }

  function pauseSession(): void {
    if (!audioCtx || !sessionActive) return;
    void audioCtx.suspend();
    setStatus('Paused.');
    updateTransport();
  }

  el.volumeEl.addEventListener('input', syncVolumeDisplay);
  el.volumeEl.addEventListener('change', syncVolumeDisplay);

  el.onePerSideCheckbox.addEventListener('change', () => {
    onePerSideMode = el.onePerSideCheckbox.checked;
    el.swapSidesBtn.disabled = queue.length !== 2 || !onePerSideMode;
    el.stage.classList.toggle('ah-stage-sides-locked', onePerSideMode && queue.length === 2);
    if (onePerSideMode && queue.length === 2) {
      applyOnePerSideLayout();
      setStatus('One per side: first list row → left ear, second → right. Swap sides to flip.');
    } else {
      setStatus('Free placement: drag dots on the map.');
    }
  });

  el.swapSidesBtn.addEventListener('click', () => {
    if (queue.length !== 2 || !onePerSideMode) return;
    twoTrackSwapped = !twoTrackSwapped;
    applyOnePerSideLayout();
    setStatus(
      twoTrackSwapped
        ? 'Swapped: first row → right, second → left.'
        : 'First row → left, second → right.',
    );
  });

  el.fileInput.addEventListener('change', async () => {
    const files = Array.from(el.fileInput.files || []);
    el.fileInput.value = '';
    if (!files.length) return;
    ensureAudioContext();
    const baseLen = queue.length;
    const addCount = files.length;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const pan = defaultPanForIndex(baseLen + i, baseLen + addCount);
      queue.push({
        id: newTrackId(),
        file,
        name: file.name,
        buffer: null,
        ...pan,
      });
    }
    renderQueueUi();
    setStatus(`${queue.length} track(s). Drag dots on the map to place each sound, then Play all.`);
  });

  el.queueList.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('button');
    if (btn?.dataset.action !== 'remove' || !btn.dataset.id) return;
    const id = btn.dataset.id;
    const idx = queue.findIndex((q) => q.id === id);
    if (idx < 0) return;

    const layer = activeLayers.find((l) => l.id === id);
    if (layer) {
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
      activeLayers = activeLayers.filter((l) => l.id !== id);
      endedCount = Math.min(endedCount, activeLayers.length);
      if (activeLayers.length === 0) {
        sessionActive = false;
        if (audioCtx?.state === 'suspended') void audioCtx.resume();
      }
    }

    queue.splice(idx, 1);
    renderQueueUi();
    if (sessionActive && audioCtx?.state === 'running') {
      syncPannersFromQueue();
      syncVolumeDisplay();
    }
    setStatus(queue.length ? `${queue.length} track(s).` : 'Add audio files to begin.');
    updateTransport();
  });

  el.queueList.addEventListener('dragstart', (e) => {
    if (!(e.target as HTMLElement).closest('.ah-drag')) return;
    const li = (e.target as HTMLElement).closest('li.ah-queue-item') as HTMLElement | null;
    if (!li?.dataset.id) return;
    dragSourceId = li.dataset.id;
    li.classList.add('drag-over');
    e.dataTransfer?.setData('text/plain', li.dataset.id);
    e.dataTransfer!.effectAllowed = 'move';
  });

  el.queueList.addEventListener('dragend', (e) => {
    if (!(e.target as HTMLElement).closest('.ah-drag')) return;
    const li = (e.target as HTMLElement).closest('li.ah-queue-item') as HTMLElement | null;
    li?.classList.remove('drag-over');
    el.queueList.querySelectorAll('.ah-queue-item.drag-over').forEach((node) => {
      (node as HTMLElement).classList.remove('drag-over');
    });
    dragSourceId = null;
  });

  el.queueList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const li = (e.target as HTMLElement).closest('li.ah-queue-item') as HTMLElement | null;
    el.queueList.querySelectorAll('.ah-queue-item.drag-over').forEach((node) => {
      const row = node as HTMLElement;
      if (row !== li) row.classList.remove('drag-over');
    });
    li?.classList.add('drag-over');
  });

  el.queueList.addEventListener('dragleave', (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && el.queueList.contains(related)) return;
    (e.target as HTMLElement).closest('li.ah-queue-item')?.classList.remove('drag-over');
  });

  el.queueList.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetLi = (e.target as HTMLElement).closest('li.ah-queue-item') as HTMLElement | null;
    const id = e.dataTransfer?.getData('text/plain') || dragSourceId;
    el.queueList.querySelectorAll('.ah-queue-item.drag-over').forEach((node) => {
      (node as HTMLElement).classList.remove('drag-over');
    });
    if (!id || !targetLi?.dataset.id) return;

    const from = queue.findIndex((q) => q.id === id);
    const to = queue.findIndex((q) => q.id === targetLi.dataset.id);
    if (from < 0 || to < 0 || from === to) return;

    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item!);
    dragSourceId = null;
    renderQueueUi();
    if (sessionActive) {
      syncPannersFromQueue();
      syncVolumeDisplay();
    }
    setStatus('List order updated (which dot draws on top when they overlap).');
  });

  el.playBtn.addEventListener('click', () => {
    void startAllLayers();
  });

  el.pauseBtn.addEventListener('click', () => {
    pauseSession();
  });

  el.stopBtn.addEventListener('click', () => {
    stopPlayback(true);
    setStatus(queue.length ? 'Stopped. Press Play all again from the same map layout.' : 'Add audio files to begin.');
    renderQueueUi();
    updateTransport();
  });

  el.downloadBtn.addEventListener('click', () => {
    void downloadMixWav();
  });

  el.dotsEl.addEventListener(
    'wheel',
    (e) => {
      if (onePerSideMode && queue.length === 2) return;
      const dot = (e.target as HTMLElement).closest('.ah-dot') as HTMLElement | null;
      if (!dot?.dataset.id) return;
      e.preventDefault();
      const track = queue.find((q) => q.id === dot.dataset.id);
      if (!track) return;
      const step = e.deltaY < 0 ? 0.16 : -0.16;
      track.panHeight = Math.min(MAX_PAN_HEIGHT, Math.max(MIN_PAN_HEIGHT, track.panHeight + step));
      renderDots();
      syncPannersFromQueue();
    },
    { passive: false },
  );

  el.dotsEl.addEventListener('pointerdown', (e) => {
    if (onePerSideMode && queue.length === 2) return;
    if (draggingTrackId) return;
    const dot = (e.target as HTMLElement).closest('.ah-dot') as HTMLElement | null;
    if (!dot?.dataset.id) return;
    const track = queue.find((q) => q.id === dot.dataset.id);
    if (!track) return;
    e.preventDefault();
    draggingTrackId = track.id;
    dot.classList.add('ah-dot-dragging');
    dot.setPointerCapture(e.pointerId);
    applyPointerToTrackPan(track, e.clientX, e.clientY);
    renderDots();
    syncPannersFromQueue();
    document.addEventListener('pointermove', onStageDragMove);
    document.addEventListener('pointerup', onStageDragEnd);
    document.addEventListener('pointercancel', onStageDragEnd);
  });

  window.addEventListener('resize', () => {
    if (queue.length) refreshSpatialVisual();
  });

  syncVolumeDisplay();
  renderQueueUi();
  setStatus('Add tracks, drag each dot around your head on the map, then press Play all.');
}
