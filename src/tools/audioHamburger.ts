/**
 * Audio Hamburger — play every track at once in 3D space.
 * List order sets the vertical stack (top = lowest, bottom = highest) plus a mild front arc.
 */

import { showNotification } from '../ui/notification.js';
import { audioBufferToWavBlob } from '../utils/wav.js';

type QueuedTrack = { id: string; file: File; name: string; buffer: AudioBuffer | null };

type ActiveLayer = {
  id: string;
  source: AudioBufferSourceNode;
  panner: PannerNode;
};

function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

function newTrackId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Top of list = lowest Y; bottom = highest. Mild XZ arc in front of listener. */
function stackPosition(index: number, n: number): { x: number; y: number; z: number } {
  if (n <= 0) return { x: 0, y: 0, z: -2.2 };
  const yLo = -2.4;
  const yHi = 2.4;
  const y = n === 1 ? 0 : yLo + (index / (n - 1)) * (yHi - yLo);
  const spread = Math.min(1.1, 0.35 + n * 0.12);
  const r = 2.15;
  if (n === 1) {
    return { x: 0, y: 0, z: -r };
  }
  const u = index / (n - 1);
  const theta = (u - 0.5) * spread;
  const x = Math.sin(theta) * r;
  const z = -Math.cos(theta) * r;
  return { x, y, z };
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
    !dotsEl
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

  function applyStackPositions(): void {
    const n = queue.length;
    queue.forEach((track, index) => {
      const layer = activeLayers.find((l) => l.id === track.id);
      if (!layer || !audioCtx) return;
      const { x, y, z } = stackPosition(index, n);
      const now = audioCtx.currentTime;
      layer.panner.positionX.setValueAtTime(x, now);
      layer.panner.positionY.setValueAtTime(y, now);
      layer.panner.positionZ.setValueAtTime(z, now);
    });
    renderDots();
  }

  function renderDots(): void {
    el.dotsEl.innerHTML = '';
    const rect = el.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const n = queue.length;
    const maxR = Math.min(rect.width, rect.height) * 0.36;
    const worldR = 2.5;

    queue.forEach((track, index) => {
      const { x, y, z } = stackPosition(index, n);
      const dot = document.createElement('div');
      dot.className = 'ah-dot';
      dot.title = track.name;
      dot.style.background = dotHue(index, n);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const scale = (maxR / worldR) * 0.92;
      const px = cx + x * scale;
      const py = cy + z * scale - y * (scale * 0.22);
      dot.style.left = `${px}px`;
      dot.style.top = `${py}px`;
      const depth = -z;
      const glow = 12 + depth * 4;
      dot.style.boxShadow = `0 0 ${glow}px rgba(0, 0, 0, 0.5)`;
      el.dotsEl.appendChild(dot);
    });
  }

  function teardownGraph(): void {
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
    setStatus('Rendering binaural mix (offline). Long stacks take longer…');

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
      const nQ = queue.length;
      const nPlay = playable.length;
      master.gain.value = Number(el.volumeEl.value) * perLayerGainScalar(nPlay);
      master.connect(offline.destination);

      for (let qi = 0; qi < queue.length; qi++) {
        const track = queue[qi]!;
        if (!track.buffer) continue;
        const panner = offline.createPanner();
        configurePanner(panner);
        const { x, y, z } = stackPosition(qi, nQ);
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

      setStatus('Saved stereo binaural WAV (same stack as the list). Use headphones when playing it back.');
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
      grip.title = 'Drag to reorder';
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

    if (sessionActive || queue.length) {
      renderDots();
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
      const { x, y, z } = stackPosition(queue.indexOf(track), queue.length);
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
      src.onended = onLayerEnded;
      src.start(t0);
      activeLayers.push({ id: track.id, source: src, panner });
    });

    syncVolumeDisplay();
    setStatus(n === 1 ? 'Playing one layer.' : `Playing ${n} layers at once.`);
    renderDots();
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

  el.fileInput.addEventListener('change', async () => {
    const files = Array.from(el.fileInput.files || []);
    el.fileInput.value = '';
    if (!files.length) return;
    ensureAudioContext();
    for (const file of files) {
      queue.push({ id: newTrackId(), file, name: file.name, buffer: null });
    }
    renderQueueUi();
    setStatus(`${queue.length} track(s). Press Play all to stack them in space.`);
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
      applyStackPositions();
      syncVolumeDisplay();
    }
    setStatus(queue.length ? `${queue.length} track(s) in stack.` : 'Add audio files to begin.');
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
      applyStackPositions();
      syncVolumeDisplay();
    }
    setStatus('Order updated — heights follow the list.');
  });

  el.playBtn.addEventListener('click', () => {
    void startAllLayers();
  });

  el.pauseBtn.addEventListener('click', () => {
    pauseSession();
  });

  el.stopBtn.addEventListener('click', () => {
    stopPlayback(true);
    setStatus(queue.length ? 'Stopped. Press Play all to run the stack again.' : 'Add audio files to begin.');
    renderQueueUi();
    updateTransport();
  });

  el.downloadBtn.addEventListener('click', () => {
    void downloadMixWav();
  });

  window.addEventListener('resize', () => {
    if (queue.length) renderDots();
  });

  syncVolumeDisplay();
  renderQueueUi();
  setStatus('Add at least two files for the full “burger” effect, or one for a centered layer.');
}
