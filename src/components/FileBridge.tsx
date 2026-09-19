import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TOOLS, type ToolDef } from '../toolRegistry';

type Handler = (files: File[]) => void;

interface Bridge {
  /** The open tool registers what to do with files handed to it. Returns an unregister function. */
  register(handler: Handler): () => void;
  /** Open another tool with these files (a result handed on, for example). */
  sendTo(tool: ToolDef, files: File[]): void;
  /** Give files to the tool that's open (used for paste). Returns false when it doesn't take files. */
  deliver(files: File[]): boolean;
}

const BridgeContext = createContext<Bridge | null>(null);

export function FileBridgeProvider({ open, onOpenTool, children }: { open: ToolDef; onOpenTool: (tool: ToolDef) => void; children: ReactNode }) {
  const handlerRef = useRef<Handler | null>(null);
  // Files handed over before the receiving tool has mounted and registered.
  const pendingRef = useRef<{ toolId: string; files: File[] } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const register = useCallback((handler: Handler) => {
    handlerRef.current = handler;
    const waiting = pendingRef.current;
    if (waiting && waiting.toolId === openRef.current.id) {
      pendingRef.current = null;
      // Let the tool finish mounting before it starts loading files.
      queueMicrotask(() => handler(waiting.files));
    }
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  const sendTo = useCallback(
    (tool: ToolDef, files: File[]) => {
      if (tool.id === openRef.current.id) {
        handlerRef.current?.(files);
        return;
      }
      pendingRef.current = { toolId: tool.id, files };
      onOpenTool(tool);
    },
    [onOpenTool],
  );

  const deliver = useCallback((files: File[]) => {
    if (!handlerRef.current || !files.length) return false;
    handlerRef.current(files);
    return true;
  }, []);

  const bridge = useMemo<Bridge>(() => ({ register, sendTo, deliver }), [register, sendTo, deliver]);

  // Paste a file anywhere to load it into the open tool.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      const target = event.target as HTMLElement | null;
      // Let a genuine text paste into a field win.
      if (target?.closest('input:not([type=file]), textarea, [contenteditable]') && !event.clipboardData?.types.includes('Files')) return;
      if (deliver(files)) event.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [deliver]);

  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

function useBridge(): Bridge | null {
  return useContext(BridgeContext);
}

/**
 * Receive files sent from another tool or pasted by the user.
 * Tools that take files should call this with the same handler as their drop zone.
 */
export function useIncomingFiles(handler: Handler): void {
  const bridge = useBridge();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bridge?.register((files) => ref.current(files)), [bridge]);
}

/** What a tool can be handed. */
export type FileKind = NonNullable<ToolDef['accepts']>[number];

/** Tools that accept this kind of file, minus the one you're in. */
export function receiversFor(kind: FileKind, exceptToolId: string): ToolDef[] {
  return TOOLS.filter((t) => t.id !== exceptToolId && t.accepts?.includes(kind));
}

export function useSendTo(): (tool: ToolDef, files: File[]) => void {
  const bridge = useBridge();
  return useCallback((tool: ToolDef, files: File[]) => bridge?.sendTo(tool, files), [bridge]);
}
