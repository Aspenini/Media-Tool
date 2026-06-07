import { useCallback, useEffect, useState } from 'react';

/**
 * Keeps an active tab index in sync with `location.hash`, preserving the
 * deep-link hashes used by the original app (e.g. `#scaler`, `#360-viewer`).
 */
export function useHashTab(hashes: readonly string[]): [number, (index: number) => void] {
  const indexFromHash = useCallback((): number => {
    const hash = window.location.hash.slice(1).toLowerCase();
    const idx = hashes.indexOf(hash);
    return idx >= 0 ? idx : 0;
  }, [hashes]);

  const [active, setActive] = useState<number>(indexFromHash);

  useEffect(() => {
    const onHashChange = () => setActive(indexFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [indexFromHash]);

  const select = useCallback(
    (index: number) => {
      setActive(index);
      const hash = hashes[index];
      if (hash) {
        const newUrl = `${window.location.pathname}${window.location.search}#${hash}`;
        window.history.replaceState(null, '', newUrl);
      }
    },
    [hashes],
  );

  return [active, select];
}
