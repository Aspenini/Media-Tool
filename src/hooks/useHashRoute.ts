import { useCallback, useEffect, useState } from 'react';

const readHash = () => window.location.hash.slice(1).toLowerCase();

/**
 * Keeps the active tab in sync with `location.hash`, preserving the deep-link
 * hashes used by the original app (e.g. `#scaler`, `#360-viewer`).
 */
export function useHashRoute(): [string, (hash: string) => void] {
  const [hash, setHash] = useState(readHash);

  useEffect(() => {
    const sync = () => setHash(readHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const select = useCallback((next: string) => {
    setHash(next);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${next}`);
  }, []);

  return [hash, select];
}
