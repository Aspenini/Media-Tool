import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTool } from '../components/Workbench';

/**
 * `useState` that remembers the value for this tool between visits.
 * For settings only — not for loaded files, results or anything large.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const tool = useTool();
  const storageKey = `media-tool:${tool.id}:${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      // Storage can be blocked (private mode) or hold stale JSON.
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Best-effort: a full or blocked store shouldn't break the tool.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
