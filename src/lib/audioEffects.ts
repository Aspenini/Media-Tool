export type AudioEffectId = 'vintageRadio' | 'bitcrusher8' | 'bitcrusher16';

export const AUDIO_EFFECTS: { id: AudioEffectId; label: string }[] = [
  { id: 'vintageRadio', label: 'Vintage Radio (1940s-1950s)' },
  { id: 'bitcrusher8', label: '8-bit (Bitcrusher)' },
  { id: 'bitcrusher16', label: '16-bit (Bitcrusher)' },
];

function createSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

async function applyVintageRadioEffect(buffer: AudioBuffer): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const mono = offline.createBuffer(1, buffer.length, buffer.sampleRate);
  const channels =
    buffer.numberOfChannels > 1
      ? Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch))
      : [buffer.getChannelData(0)];
  const monoData = mono.getChannelData(0);
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (const data of channels) sum += data[i];
    monoData[i] = sum / channels.length;
  }

  const source = offline.createBufferSource();
  source.buffer = mono;

  const bandpass = offline.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 3000;
  bandpass.Q.value = 0.7;
  source.connect(bandpass);

  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  bandpass.connect(compressor);

  const saturation = offline.createWaveShaper();
  saturation.curve = createSaturationCurve(0.25);
  compressor.connect(saturation);

  const noiseBuffer = offline.createBuffer(1, buffer.length, buffer.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < buffer.length; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.008;
  const noiseSource = offline.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const mixGain = offline.createGain();
  mixGain.gain.value = 1.0;
  saturation.connect(mixGain);
  noiseSource.connect(mixGain);
  mixGain.connect(offline.destination);

  source.start(0);
  noiseSource.start(0);
  return offline.startRendering();
}

function applyBitcrusherEffect(ctx: BaseAudioContext, buffer: AudioBuffer, targetBitDepth: number): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const targetRate = targetBitDepth === 8 ? 11025 : 22050;
  const holdInterval = Math.max(1, Math.round(sampleRate / targetRate));
  const output = ctx.createBuffer(numChannels, buffer.length, sampleRate);
  const levels = Math.pow(2, targetBitDepth);

  for (let ch = 0; ch < numChannels; ch++) {
    const inData = buffer.getChannelData(ch);
    const outData = output.getChannelData(ch);
    let held = 0;
    for (let i = 0; i < inData.length; i++) {
      if (i % holdInterval === 0) {
        const s = Math.max(-1, Math.min(1, inData[i]));
        const normalized = (s + 1) / 2;
        held = (Math.round(normalized * (levels - 1)) / (levels - 1)) * 2 - 1;
      }
      outData[i] = held;
    }
  }
  return output;
}

export async function applyAudioEffect(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  effect: AudioEffectId,
): Promise<AudioBuffer> {
  switch (effect) {
    case 'bitcrusher8':
      return applyBitcrusherEffect(ctx, buffer, 8);
    case 'bitcrusher16':
      return applyBitcrusherEffect(ctx, buffer, 16);
    default:
      return applyVintageRadioEffect(buffer);
  }
}

export function exportBitDepthFor(effect: AudioEffectId): number {
  return effect === 'bitcrusher8' ? 8 : 16;
}
