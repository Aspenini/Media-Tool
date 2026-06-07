/** Shared helpers for loading and exporting images. */

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function canvasToBlobUrl(canvas: HTMLCanvasElement, type = 'image/png'): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL(type));
    }, type);
  });
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

/** Nearest-neighbour integer/float upscale onto the supplied canvas. */
export function scaleImageToCanvas(
  img: HTMLImageElement,
  factor: number,
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  canvas.width = Math.max(1, Math.round(img.width * factor));
  canvas.height = Math.max(1, Math.round(img.height * factor));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

export type DiagonalDirection = 'tl2br' | 'tr2bl';

export function drawDiagonalSlice(
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
  width: number,
  height: number,
  direction: DiagonalDirection,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(imgA, 0, 0);
  ctx.save();
  ctx.beginPath();
  if (direction === 'tl2br') {
    ctx.moveTo(0, 0);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
  } else {
    ctx.moveTo(canvas.width, 0);
    ctx.lineTo(0, canvas.height);
    ctx.lineTo(canvas.width, canvas.height);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(imgB, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export function extractNumber(name: string): string {
  const match = name.match(/\d+/);
  return match ? match[0] : '00';
}
