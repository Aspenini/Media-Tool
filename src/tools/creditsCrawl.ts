/** End credits scroll preview and WebM export via canvas + MediaRecorder. */

import { showNotification } from '../ui/notification.js';

type CreditItem =
  | { type: 'category'; text: string }
  | { type: 'entry'; name: string; title: string | null };

function fontToCssFamily(f: string): string {
  return /\s/.test(f) ? `"${f}"` : f;
}

function pickWebmMimeType(): string | null {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

function updateGoogleFontLink(link: HTMLLinkElement, family: string): void {
  const familyParam = `${family.replace(/ /g, '+')}:wght@400;700`;
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
}

async function warmLoadFonts(family: string, categoryPx: number, entryPx: number): Promise<void> {
  if (!document.fonts?.load) return;
  const fam = fontToCssFamily(family);
  try {
    await Promise.all([
      document.fonts.load(`700 ${categoryPx}px ${fam}`),
      document.fonts.load(`400 ${entryPx}px ${fam}`),
    ]);
  } catch {
    /* ignore */
  }
}

export function initCreditsCrawl(): void {
  const tabRoot = document.getElementById('creditsCrawlTab');
  const categoriesContainer = document.getElementById('ccCategories');
  const addCategoryBtn = document.getElementById('ccAddCategory');
  const generateBtn = document.getElementById('ccGenerate');
  const canvasContainer = document.getElementById('ccCanvasContainer');
  const previewCanvas = document.getElementById('ccPreviewCanvas');
  const closePreviewBtn = document.getElementById('ccClosePreview');
  const downloadVideoBtn = document.getElementById('ccDownloadVideo');
  const fontSelect = document.getElementById('ccFontSelect');

  if (tabRoot === null) return;
  if (categoriesContainer === null) return;
  if (!(addCategoryBtn instanceof HTMLButtonElement)) return;
  if (!(generateBtn instanceof HTMLButtonElement)) return;
  if (!(canvasContainer instanceof HTMLElement)) return;
  if (!(previewCanvas instanceof HTMLCanvasElement)) return;
  if (!(closePreviewBtn instanceof HTMLButtonElement)) return;
  if (!(downloadVideoBtn instanceof HTMLButtonElement)) return;
  if (!(fontSelect instanceof HTMLSelectElement)) return;

  const creditsTab = tabRoot;
  const categoriesEl = categoriesContainer;
  const overlayEl = canvasContainer;
  const canvasEl = previewCanvas;
  const downloadBtn = downloadVideoBtn;
  const fontEl = fontSelect;

  const gfontLink = document.createElement('link');
  gfontLink.rel = 'stylesheet';
  gfontLink.href =
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap';
  document.head.appendChild(gfontLink);

  const ctxMaybe = canvasEl.getContext('2d');
  if (!ctxMaybe) return;
  const canvasCtx = ctxMaybe;

  const categories: HTMLElement[] = [];
  let currentFont = fontEl.value;
  let mediaRecorder: MediaRecorder | undefined;
  let recordedChunks: Blob[] = [];
  let recordingActive = false;
  let lastDownloadUrl: string | null = null;

  function applyTabFont(family: string): void {
    creditsTab.style.fontFamily = `${fontToCssFamily(family)}, 'DM Sans', system-ui, sans-serif`;
    currentFont = family;
  }

  function updateFontFromSelect(): void {
    const family = fontEl.value;
    updateGoogleFontLink(gfontLink, family);
    applyTabFont(family);
    void warmLoadFonts(family, 60, 40);
  }

  fontEl.addEventListener('change', () => {
    updateFontFromSelect();
  });

  applyTabFont(currentFont);
  updateGoogleFontLink(gfontLink, currentFont);

  function createEntry(entriesDiv: HTMLElement): void {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'credits-crawl-entry';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name';
    nameInput.setAttribute('aria-label', 'Name');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Role (optional)';
    titleInput.setAttribute('aria-label', 'Role (optional)');

    const removeEntryBtn = document.createElement('button');
    removeEntryBtn.type = 'button';
    removeEntryBtn.className = 'credits-crawl-icon-btn';
    removeEntryBtn.title = 'Remove entry';
    removeEntryBtn.textContent = '×';
    removeEntryBtn.addEventListener('click', () => {
      entryDiv.remove();
    });

    entryDiv.append(nameInput, titleInput, removeEntryBtn);
    entriesDiv.appendChild(entryDiv);
  }

  function createCategory(): void {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'credits-crawl-category';

    const header = document.createElement('div');
    header.className = 'credits-crawl-category-header';

    const categoryInput = document.createElement('input');
    categoryInput.type = 'text';
    categoryInput.placeholder = 'Category Name (e.g., Audio Production Team)';

    const removeCategoryBtn = document.createElement('button');
    removeCategoryBtn.type = 'button';
    removeCategoryBtn.className = 'credits-crawl-icon-btn';
    removeCategoryBtn.title = 'Remove category';
    removeCategoryBtn.textContent = '×';
    removeCategoryBtn.addEventListener('click', () => {
      categoryDiv.remove();
      const i = categories.indexOf(categoryDiv);
      if (i !== -1) categories.splice(i, 1);
    });

    header.append(categoryInput, removeCategoryBtn);

    const entriesDiv = document.createElement('div');
    entriesDiv.className = 'credits-crawl-entries';

    const addEntryBtn = document.createElement('button');
    addEntryBtn.type = 'button';
    addEntryBtn.className = 'credits-crawl-add-entry';
    addEntryBtn.textContent = '+ Add Name/Role';
    addEntryBtn.addEventListener('click', () => {
      createEntry(entriesDiv);
    });

    categoryDiv.append(header, entriesDiv, addEntryBtn);
    categoriesEl.appendChild(categoryDiv);
    categories.push(categoryDiv);

    createEntry(entriesDiv);
  }

  addCategoryBtn.addEventListener('click', () => {
    createCategory();
  });

  function collectCreditsData(): CreditItem[] {
    const creditsData: CreditItem[] = [];
    for (const categoryDiv of categories) {
      const headerInput = categoryDiv.querySelector<HTMLInputElement>('.credits-crawl-category-header input');
      const categoryName = headerInput?.value.trim() ?? '';
      if (!categoryName) continue;

      creditsData.push({ type: 'category', text: categoryName });

      const entries = categoryDiv.querySelectorAll<HTMLElement>('.credits-crawl-entry');
      for (const entry of entries) {
        const inputs = entry.querySelectorAll<HTMLInputElement>('input[type="text"]');
        const name = inputs[0]?.value.trim() ?? '';
        const title = inputs[1]?.value.trim() ?? '';
        if (name) {
          creditsData.push({ type: 'entry', name, title: title || null });
        }
      }
    }
    return creditsData;
  }

  function resetDownloadHandler(): void {
    downloadBtn.disabled = true;
    downloadBtn.onclick = null;
    if (lastDownloadUrl) {
      URL.revokeObjectURL(lastDownloadUrl);
      lastDownloadUrl = null;
    }
  }

  function startRecording(stream: MediaStream, mimeType: string): void {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      lastDownloadUrl = url;
      downloadBtn.disabled = false;
      downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'credits-crawl.webm';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
          lastDownloadUrl = null;
          downloadBtn.disabled = true;
        }, 100);
      };
      recordingActive = false;
    };
    mediaRecorder.start();
    recordingActive = true;
  }

  function stopRecordingIfActive(): void {
    if (mediaRecorder && recordingActive && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }

  async function animateCredits(data: CreditItem[]): Promise<void> {
    const width = canvasEl.width;
    const height = canvasEl.height;

    const fontSizeCategory = 60;
    const fontSizeEntry = 40;
    const lineHeight = 80;
    const scrollSpeed = 2;
    const fps = 30;

    await warmLoadFonts(currentFont, fontSizeCategory, fontSizeEntry);

    let totalHeight = height;
    for (const item of data) {
      totalHeight += item.type === 'category' ? lineHeight * 2 : lineHeight;
    }

    const mimeType = pickWebmMimeType();
    if (!mimeType) {
      showNotification('WebM recording is not supported in this browser.', 'error');
      overlayEl.style.display = 'none';
      overlayEl.setAttribute('aria-hidden', 'true');
      return;
    }

    const stream = canvasEl.captureStream(fps);
    startRecording(stream, mimeType);

    let yOffset = height;

    function drawFrame(): void {
      canvasCtx.fillStyle = '#000';
      canvasCtx.fillRect(0, 0, width, height);

      canvasCtx.fillStyle = '#fff';
      canvasCtx.textAlign = 'center';

      let currentY = yOffset;
      for (const item of data) {
        if (item.type === 'category') {
          canvasCtx.font = `700 ${fontSizeCategory}px ${fontToCssFamily(currentFont)}, Arial, sans-serif`;
          canvasCtx.fillText(item.text, width / 2, currentY);
          currentY += lineHeight * 2;
        } else {
          canvasCtx.font = `400 ${fontSizeEntry}px ${fontToCssFamily(currentFont)}, Arial, sans-serif`;
          const line = item.title ? `${item.name} - ${item.title}` : item.name;
          canvasCtx.fillText(line, width / 2, currentY);
          currentY += lineHeight;
        }
      }

      yOffset -= scrollSpeed;

      if (yOffset > -totalHeight) {
        requestAnimationFrame(drawFrame);
      } else {
        stopRecordingIfActive();
      }
    }

    drawFrame();
  }

  generateBtn.addEventListener('click', () => {
    const creditsData = collectCreditsData();
    if (creditsData.length === 0) {
      showNotification('Add at least one category with a name, and at least one person.', 'error');
      return;
    }

    resetDownloadHandler();
    overlayEl.style.display = 'flex';
    overlayEl.setAttribute('aria-hidden', 'false');
    void animateCredits(creditsData);
  });

  closePreviewBtn.addEventListener('click', () => {
    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden', 'true');
    stopRecordingIfActive();
  });

  createCategory();
}
