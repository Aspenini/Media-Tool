import { showNotification } from './notification.js';

const HASH_TO_TAB: Record<string, string> = {
  scaler: 'scalerTab',
  'slicer-tool': 'slicerTab',
  'audio-effects': 'audioTab',
  'color-palette': 'paletteTab',
  'csv-to-image': 'csvTab',
  'qr-code': 'qrcodeTab',
  'brainfuck-encoder': 'brainfuckTab',
  pagnai: 'pagnaiTab',
  'audio-spinning': 'audioSpinningTab',
  'audio-hamburger': 'audioHamburgerTab',
  'credits-crawl': 'creditsCrawlTab',
};

function tabIdToHash(tabId: string): string {
  const entry = Object.entries(HASH_TO_TAB).find(([, id]) => id === tabId);
  return entry ? entry[0] : '';
}

export function openTab(tabId: string): void {
  try {
    const allTabs = document.querySelectorAll<HTMLElement>('.tabcontent');
    allTabs.forEach((tab) => {
      if (tab.id !== tabId) {
        tab.style.display = 'none';
        tab.classList.remove('active');
      }
    });

    const allButtons = document.querySelectorAll('.tab-button');
    allButtons.forEach((btn) => btn.classList.remove('active'));

    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((btn) => btn.classList.add('active'));

    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
      selectedTab.style.display = 'block';
      selectedTab.classList.add('active');
      const hash = tabIdToHash(tabId);
      if (hash) {
        history.replaceState(null, '', `#${hash}`);
      }
    } else {
      console.error(`Tab with id "${tabId}" not found`);
      showNotification('Tab not found', 'error');
    }
  } catch (error) {
    console.error('Error switching tabs:', error);
    showNotification('Error switching tabs', 'error');
  }
}

export function selectMobileTab(tabId: string): void {
  openTab(tabId);
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) mobileMenu.style.display = 'none';
}

export function initTabs(): void {
  function openFromHash(): void {
    const hash = window.location.hash.slice(1).toLowerCase();
    const tabId = hash ? HASH_TO_TAB[hash] : null;
    if (tabId) {
      openTab(tabId);
    }
  }

  openFromHash();
  window.addEventListener('hashchange', openFromHash);

  document.querySelectorAll<HTMLElement>('#tabs .tab-button[data-tab]').forEach((btn) => {
    const tabId = btn.dataset.tab;
    if (tabId) {
      btn.addEventListener('click', () => openTab(tabId));
    }
  });

  document.querySelectorAll<HTMLElement>('.mobile-menu-item[data-tab]').forEach((btn) => {
    const tabId = btn.dataset.tab;
    if (tabId) {
      btn.addEventListener('click', () => selectMobileTab(tabId));
    }
  });

  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.style.display =
        mobileMenu.style.display === 'none' || mobileMenu.style.display === '' ? 'block' : 'none';
    });
  }
}
