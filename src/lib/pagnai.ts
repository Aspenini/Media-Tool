export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export const WAVE_TYPES: { id: WaveType; label: string }[] = [
  { id: 'sine', label: 'Sine Wave' },
  { id: 'square', label: 'Square Wave' },
  { id: 'sawtooth', label: 'Sawtooth Wave' },
  { id: 'triangle', label: 'Triangle Wave' },
  { id: 'noise', label: 'White Noise' },
];

export interface PagnaiParams {
  waveType: WaveType;
  frequency: number;
  duration: number;
  volume: number;
  modulation: boolean;
  modFreq: number;
  modDepth: number;
}

function waveSample(waveType: WaveType, phase: number, twoPi: number): number {
  switch (waveType) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'sawtooth':
      return (2 * (phase % twoPi)) / twoPi - 1;
    case 'triangle':
      return 2 * Math.abs((2 * (phase % twoPi)) / twoPi - 1) - 1;
    case 'sine':
    default:
      return Math.sin(phase);
  }
}

export function generatePagnaiBuffer(ctx: BaseAudioContext, params: PagnaiParams): AudioBuffer {
  const { waveType, frequency, duration, volume, modulation, modFreq, modDepth } = params;
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const twoPi = 2 * Math.PI;

  if (waveType === 'noise') {
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * volume;
    return buffer;
  }

  if (modulation) {
    let modPhase = 0;
    for (let i = 0; i < length; i++) {
      const currentFreq = frequency + Math.sin(modPhase) * modDepth;
      const phase = (currentFreq * twoPi * i) / sampleRate;
      data[i] = waveSample(waveType, phase, twoPi) * volume;
      modPhase += (modFreq * twoPi) / sampleRate;
    }
  } else {
    for (let i = 0; i < length; i++) {
      const phase = (frequency * twoPi * i) / sampleRate;
      data[i] = waveSample(waveType, phase, twoPi) * volume;
    }
  }
  return buffer;
}
