import '../style.css';
import { initTabs } from './ui/tabs.js';
import { initScaler } from './tools/scaler.js';
import { initSlicer } from './tools/slicer.js';
import { initAudio } from './tools/audio.js';
import { initPalette } from './tools/palette.js';
import { initCsv } from './tools/csv.js';
import { initBrainfuck } from './tools/brainfuck.js';
import { initPagnai } from './tools/pagnai.js';
import { initQrcode } from './tools/qrcode.js';
import { initAudioSpinning } from './tools/audioSpinning.js';

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initScaler();
  initSlicer();
  initAudio();
  initPalette();
  initCsv();
  initBrainfuck();
  initPagnai();
  initQrcode();
  initAudioSpinning();
});
