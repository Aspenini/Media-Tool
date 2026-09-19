import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueuedFile {
  id: string;
  file: File;
}

interface FileQueueOptions<T extends QueuedFile> {
  /** Build the per-item record for a newly added file (defaults to `{ id, file }`). */
  create?: (file: File, id: string) => T;
  /** Release resources (object URLs…) when an item leaves the queue or the tool closes. */
  dispose?: (item: T) => void;
  /** Skip files already queued with the same name and size. Default true. */
  dedupe?: boolean;
}

export interface FileQueue<T extends QueuedFile> {
  items: T[];
  /** Adds files and returns the items actually queued. */
  add(files: File[]): T[];
  remove(id: string): void;
  clear(): void;
  update(id: string, patch: Partial<T> | ((item: T) => Partial<T>)): void;
  /** Rewrite every item (e.g. to drop stale results). */
  updateAll(map: (item: T) => T): void;
  sort(compare: (a: T, b: T) => number): void;
}

let nextId = 0;

/**
 * A list of files with stable ids, for tools that work on several at once.
 * The ref is the source of truth, so async callbacks never see a stale list.
 */
export function useFileQueue<T extends QueuedFile = QueuedFile>(options: FileQueueOptions<T> = {}): FileQueue<T> {
  const [items, setItems] = useState<T[]>([]);
  const itemsRef = useRef<T[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const commit = useCallback((next: T[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  useEffect(
    () => () => {
      const dispose = optionsRef.current.dispose;
      if (dispose) itemsRef.current.forEach(dispose);
    },
    [],
  );

  const add = useCallback(
    (files: File[]) => {
      const { create, dedupe = true } = optionsRef.current;
      const current = itemsRef.current;
      const fresh = files
        .filter((f, i) => !dedupe || (!current.some((q) => q.file.name === f.name && q.file.size === f.size) && files.findIndex((g) => g.name === f.name && g.size === f.size) === i))
        .map((file) => {
          const id = `file-${nextId++}`;
          return create ? create(file, id) : ({ id, file } as T);
        });
      if (fresh.length) commit([...current, ...fresh]);
      return fresh;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const gone = itemsRef.current.find((item) => item.id === id);
      if (!gone) return;
      optionsRef.current.dispose?.(gone);
      commit(itemsRef.current.filter((item) => item.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    const dispose = optionsRef.current.dispose;
    if (dispose) itemsRef.current.forEach(dispose);
    commit([]);
  }, [commit]);

  const update = useCallback(
    (id: string, patch: Partial<T> | ((item: T) => Partial<T>)) => {
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item)));
    },
    [commit],
  );

  const updateAll = useCallback((map: (item: T) => T) => commit(itemsRef.current.map(map)), [commit]);

  const sort = useCallback((compare: (a: T, b: T) => number) => commit([...itemsRef.current].sort(compare)), [commit]);

  return { items, add, remove, clear, update, updateAll, sort };
}
