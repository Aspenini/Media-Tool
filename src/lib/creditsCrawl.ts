export type CreditItem =
  | { type: 'category'; text: string }
  | { type: 'entry'; name: string; title: string | null };

export const CREDIT_FONTS = [
  'Poppins',
  'Montserrat',
  'Roboto',
  'Merriweather',
  'Oswald',
  'Lora',
  'Playfair Display',
  'Raleway',
  'Noto Sans',
];

export function fontToCssFamily(family: string): string {
  return /\s/.test(family) ? `"${family}"` : family;
}

export function googleFontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`;
}

function pickWebmMimeType(): string | null {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

async function warmLoadFonts(family: string, categoryPx: number, entryPx: number): Promise<void> {
  if (!document.fonts?.load) return;
  const fam = fontToCssFamily(family);
  try {
    await Promise.all([document.fonts.load(`700 ${categoryPx}px ${fam}`), document.fonts.load(`400 ${entryPx}px ${fam}`)]);
  } catch {
    /* ignore */
  }
}

/**
 * Animate a credits crawl on the supplied canvas while recording it to WebM.
 * Resolves with an object URL for the recorded video.
 */
export async function recordCreditsCrawl(canvas: HTMLCanvasElement, data: CreditItem[], font: string): Promise<string> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const width = canvas.width;
  const height = canvas.height;
  const fontSizeCategory = 60;
  const fontSizeEntry = 40;
  const lineHeight = 80;
  const scrollSpeed = 2;
  const fps = 30;

  await warmLoadFonts(font, fontSizeCategory, fontSizeEntry);

  const mimeType = pickWebmMimeType();
  if (!mimeType) throw new Error('WebM recording is not supported in this browser.');

  let totalHeight = height;
  for (const item of data) totalHeight += item.type === 'category' ? lineHeight * 2 : lineHeight;

  return new Promise<string>((resolve, reject) => {
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(URL.createObjectURL(blob));
    };
    recorder.onerror = () => reject(new Error('Recording failed.'));
    recorder.start();

    const family = fontToCssFamily(font);
    let yOffset = height;

    const drawFrame = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';

      let currentY = yOffset;
      for (const item of data) {
        if (item.type === 'category') {
          ctx.font = `700 ${fontSizeCategory}px ${family}, Arial, sans-serif`;
          ctx.fillText(item.text, width / 2, currentY);
          currentY += lineHeight * 2;
        } else {
          ctx.font = `400 ${fontSizeEntry}px ${family}, Arial, sans-serif`;
          ctx.fillText(item.title ? `${item.name} - ${item.title}` : item.name, width / 2, currentY);
          currentY += lineHeight;
        }
      }

      yOffset -= scrollSpeed;
      if (yOffset > -totalHeight) {
        requestAnimationFrame(drawFrame);
      } else if (recorder.state === 'recording') {
        recorder.stop();
      }
    };
    drawFrame();
  });
}
