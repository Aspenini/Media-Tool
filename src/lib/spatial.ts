export type DistanceModel = 'inverse' | 'linear' | 'exponential';

export function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

/** Convert an azimuth/distance/height (listener space) into world coordinates. */
export function worldFromPan(
  azimuth: number,
  distance: number,
  height: number,
): { x: number; y: number; z: number } {
  return {
    x: Math.sin(azimuth) * distance,
    y: height,
    z: -Math.cos(azimuth) * distance,
  };
}

export function resetListener(listener: AudioListener): void {
  listener.positionX.value = 0;
  listener.positionY.value = 0;
  listener.positionZ.value = 0;
  listener.forwardX.value = 0;
  listener.forwardY.value = 0;
  listener.forwardZ.value = -1;
  listener.upX.value = 0;
  listener.upY.value = 1;
  listener.upZ.value = 0;
}

export function sanitizeFileName(name: string, fallback: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]+/g, '-').slice(0, 120);
  return base || fallback;
}
