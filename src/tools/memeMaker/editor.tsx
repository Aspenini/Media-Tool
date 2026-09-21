import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from 'react';
import { useNotification } from '../../components/NotificationProvider';
import { preloadFonts } from '../../lib/meme/fonts.ts';
import { BUILTIN_ICONS, loadSvgImage } from '../../lib/meme/icons.ts';
import { disposeMedia } from '../../lib/meme/media.ts';
import type { CaptionSlot, IconAtlas, InlineIcon, MediaAsset, Placement, TextStyle } from '../../lib/meme/types.ts';
import { useEditorActions, type EditorActions } from './actions';

export interface EditorState {
  media: MediaAsset | null;
  placement: Placement;
  captions: Record<CaptionSlot, string>;
  /** Top: fraction of media height at the caption's top edge. Bottom: at its bottom edge. */
  offsets: Record<CaptionSlot, number>;
  /** Each placement keeps its own look, so flipping between them never clobbers edits. */
  styles: Record<Placement, TextStyle>;
  customIcons: InlineIcon[];
  /** Non-null while a video is recording or a GIF is encoding. */
  exporting: { kind: 'video' | 'gif'; progress: number } | null;
}

export type EditorAction =
  | { type: 'media'; media: MediaAsset | null }
  | { type: 'placement'; placement: Placement }
  | { type: 'caption'; slot: CaptionSlot; text: string }
  | { type: 'offset'; slot: CaptionSlot; value: number }
  | { type: 'resetOffsets' }
  | { type: 'style'; patch: Partial<TextStyle> }
  | { type: 'resetStyle' }
  | { type: 'addIcon'; icon: InlineIcon }
  | { type: 'removeIcon'; id: string }
  | { type: 'exporting'; exporting: EditorState['exporting'] };

export const DEFAULT_OFFSETS: Record<CaptionSlot, number> = { top: 0.04, bottom: 0.96 };

export const DEFAULT_STYLES: Record<Placement, TextStyle> = {
  overlay: {
    fontId: 'impact',
    sizePct: 8,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 0.1,
    align: 'center',
    allCaps: true,
  },
  bar: {
    fontId: 'manrope',
    sizePct: 5.5,
    fill: '#111111',
    stroke: '#ffffff',
    strokeWidth: 0,
    align: 'left',
    allCaps: false,
  },
};

const DEFAULT_STATE: EditorState = {
  media: null,
  placement: 'overlay',
  captions: { top: 'When the :star: finally\nspawns', bottom: 'and you still miss it' },
  offsets: DEFAULT_OFFSETS,
  styles: DEFAULT_STYLES,
  customIcons: [],
  exporting: null,
};

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'media':
      return { ...state, media: action.media };
    case 'placement':
      return { ...state, placement: action.placement };
    case 'caption':
      return { ...state, captions: { ...state.captions, [action.slot]: action.text } };
    case 'offset':
      return { ...state, offsets: { ...state.offsets, [action.slot]: action.value } };
    case 'resetOffsets':
      return { ...state, offsets: DEFAULT_OFFSETS };
    case 'style':
      return {
        ...state,
        styles: { ...state.styles, [state.placement]: { ...state.styles[state.placement], ...action.patch } },
      };
    case 'resetStyle':
      return { ...state, styles: { ...state.styles, [state.placement]: DEFAULT_STYLES[state.placement] } };
    case 'addIcon':
      return { ...state, customIcons: [...state.customIcons, action.icon] };
    case 'removeIcon':
      return { ...state, customIcons: state.customIcons.filter((icon) => icon.id !== action.id) };
    case 'exporting':
      return { ...state, exporting: action.exporting };
  }
}

/* ---------- persistence: text and styling survive a reload, media does not ---------- */

const STORAGE_KEY = 'media-tool:meme-maker:v2';

type Persisted = Pick<EditorState, 'placement' | 'captions' | 'offsets' | 'styles'>;

function loadPersisted(): EditorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const saved = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...DEFAULT_STATE,
      placement: saved.placement === 'bar' ? 'bar' : 'overlay',
      captions: { ...DEFAULT_STATE.captions, ...saved.captions },
      offsets: { ...DEFAULT_OFFSETS, ...saved.offsets },
      styles: {
        overlay: { ...DEFAULT_STYLES.overlay, ...saved.styles?.overlay },
        bar: { ...DEFAULT_STYLES.bar, ...saved.styles?.bar },
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function usePersist(state: EditorState): void {
  const { placement, captions, offsets, styles } = state;
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const data: Persisted = { placement, captions, offsets, styles };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage can be full or blocked (private mode); persistence is best-effort.
      }
    }, 300);
    return () => clearTimeout(id);
  }, [placement, captions, offsets, styles]);
}

/* ---------- context ---------- */

export interface Editor extends EditorActions {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Style for the active placement. */
  style: TextStyle;
  icons: InlineIcon[];
  atlas: IconAtlas;
  /** Bumps whenever a web font finishes loading, so the canvas can repaint. */
  fontsVersion: number;
  busy: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  fieldRefs: Record<CaptionSlot, RefObject<HTMLTextAreaElement | null>>;
  setMedia(media: MediaAsset | null): void;
  removeIcon(id: string): void;
  insertIcon(id: string): void;
  rememberField(slot: CaptionSlot): void;
}

const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor must be used inside <EditorProvider>');
  return editor;
}

function useBuiltinIcons(): InlineIcon[] {
  const [icons, setIcons] = useState<InlineIcon[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all(
      BUILTIN_ICONS.map(async ({ id, label, svg }) => ({ id, label, custom: false, ...(await loadSvgImage(svg)) })),
    ).then((loaded) => {
      if (live) setIcons(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return icons;
}

const FONT_SHEET =
  'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bangers&family=Luckiest+Guy&family=Manrope:wght@400..800&display=swap';

function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    // The meme faces are only fetched while this tool is open.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_SHEET;
    const bump = () => setVersion((v) => v + 1);
    link.addEventListener('load', () => preloadFonts(bump), { once: true });
    document.head.appendChild(link);
    document.fonts?.addEventListener('loadingdone', bump);
    return () => {
      link.remove();
      document.fonts?.removeEventListener('loadingdone', bump);
    };
  }, []);
  return version;
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadPersisted);
  usePersist(state);

  const builtins = useBuiltinIcons();
  const fontsVersion = useFontsVersion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const topRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLTextAreaElement | null>(null);
  const lastField = useRef<CaptionSlot>('top');

  // Live mirror of state for event handlers that outlive a render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Release the media and custom icons when the tool is closed.
  useEffect(
    () => () => {
      const { media, customIcons } = stateRef.current;
      if (media) disposeMedia(media);
      customIcons.forEach((icon) => icon.src.startsWith('blob:') && URL.revokeObjectURL(icon.src));
    },
    [],
  );

  const icons = useMemo(() => [...builtins, ...state.customIcons], [builtins, state.customIcons]);
  const atlas = useMemo<IconAtlas>(() => {
    const byId = new Map(icons.map((icon) => [icon.id, icon.image]));
    return { get: (id) => byId.get(id), has: (id) => byId.has(id) };
  }, [icons]);

  const setMedia = useCallback((media: MediaAsset | null) => {
    const previous = stateRef.current.media;
    dispatch({ type: 'media', media });
    if (previous && previous !== media) disposeMedia(previous);
  }, []);

  const removeIcon = useCallback((id: string) => {
    const icon = stateRef.current.customIcons.find((item) => item.id === id);
    dispatch({ type: 'removeIcon', id });
    if (icon?.src.startsWith('blob:')) URL.revokeObjectURL(icon.src);
  }, []);

  const insertIcon = useCallback((id: string) => {
    const { placement, captions } = stateRef.current;
    const slot: CaptionSlot = placement === 'bar' ? 'top' : lastField.current;
    const field = (slot === 'top' ? topRef : bottomRef).current;
    const text = captions[slot];
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    // Pad with spaces so the token never glues onto neighbouring words by accident.
    const token = `${before && !/\s$/.test(before) ? ' ' : ''}:${id}:${after && !/^\s/.test(after) ? ' ' : ''}`;
    dispatch({ type: 'caption', slot, text: before + token + after });
    const caret = start + token.length;
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }, []);

  const rememberField = useCallback((slot: CaptionSlot) => {
    lastField.current = slot;
  }, []);

  const notify = useNotification();
  const actions = useEditorActions({ stateRef, dispatch, setMedia, atlas, canvasRef, notify });

  const editor: Editor = {
    ...actions,
    state,
    dispatch,
    style: state.styles[state.placement],
    icons,
    atlas,
    fontsVersion,
    busy: state.exporting !== null,
    canvasRef,
    fieldRefs: { top: topRef, bottom: bottomRef },
    setMedia,
    removeIcon,
    insertIcon,
    rememberField,
  };

  return <EditorContext value={editor}>{children}</EditorContext>;
}
