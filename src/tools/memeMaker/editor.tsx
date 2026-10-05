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
import { disposeAudio, type AudioTrack } from '../../lib/meme/audio.ts';
import { preloadFonts } from '../../lib/meme/fonts.ts';
import { BUILTIN_ICONS, loadSvgImage } from '../../lib/meme/icons.ts';
import { disposeMedia } from '../../lib/meme/media.ts';
import type { CaptionSlot, IconAtlas, InlineIcon, MediaAsset, Placement, Rect, TextStyle, Trim } from '../../lib/meme/types.ts';
import { useEditorActions, type EditorActions } from './actions';

export interface EditorState {
  media: MediaAsset | null;
  /** Normalised source crop; null for the full frame. Reset with the media. */
  crop: Rect | null;
  /** Video in/out points; null for the whole clip. Reset with the media. */
  trim: Trim | null;
  /** Video playback rate for preview and export. Reset with the media. */
  speed: number;
  /** Keep the audio's pitch when the speed isn't 1×. Reset with the media. */
  keepPitch: boolean;
  /** Soundtrack laid over a video. Survives swapping the clip. Not persisted. */
  audio: AudioTrack | null;
  /** In/out on the soundtrack; null for the whole file. */
  audioTrim: Trim | null;
  /** Soundtrack playback rate, independent of the clip's speed. */
  audioSpeed: number;
  /** Keep the soundtrack's pitch when audioSpeed isn't 1×. */
  audioKeepPitch: boolean;
  /** Soundtrack gain, 0–1. */
  audioVolume: number;
  /** Mute the clip's own audio while a soundtrack is attached. */
  replaceAudio: boolean;
  /** Fake-4K grade: sharper, more saturated, and (on video) smoother. */
  goldfish: boolean;
  /** User mute for the preview. Starts muted so a clip can autoplay. */
  previewMuted: boolean;
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
  | { type: 'crop'; crop: Rect | null }
  | { type: 'trim'; trim: Trim | null }
  | { type: 'speed'; speed: number }
  | { type: 'keepPitch'; keepPitch: boolean }
  | { type: 'audio'; audio: AudioTrack | null }
  | { type: 'audioTrim'; trim: Trim | null }
  | { type: 'audioSpeed'; speed: number }
  | { type: 'audioKeepPitch'; keepPitch: boolean }
  | { type: 'audioVolume'; volume: number }
  | { type: 'replaceAudio'; replaceAudio: boolean }
  | { type: 'goldfish'; goldfish: boolean }
  | { type: 'previewMuted'; previewMuted: boolean }
  | { type: 'placement'; placement: Placement }
  | { type: 'caption'; slot: CaptionSlot; text: string }
  | { type: 'offset'; slot: CaptionSlot; value: number }
  | { type: 'resetOffsets' }
  | { type: 'style'; patch: Partial<TextStyle> }
  | { type: 'resetStyle' }
  | { type: 'addIcon'; icon: InlineIcon }
  | { type: 'removeIcon'; id: string }
  | { type: 'exporting'; exporting: EditorState['exporting'] };

export type CropAspect = 'free' | 'original' | '1:1' | '4:5' | '16:9' | '9:16';

/** Pixel width / height a crop is locked to, or null for freeform. */
export function cropRatio(aspect: CropAspect, media: MediaAsset): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'original') return media.width / media.height;
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}

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
  crop: null,
  trim: null,
  speed: 1,
  keepPitch: true,
  audio: null,
  audioTrim: null,
  audioSpeed: 1,
  audioKeepPitch: true,
  audioVolume: 1,
  replaceAudio: true,
  goldfish: false,
  previewMuted: true,
  placement: 'overlay',
  captions: { top: 'When the :star: finally\nspawns', bottom: 'and you still miss it' },
  offsets: DEFAULT_OFFSETS,
  styles: DEFAULT_STYLES,
  customIcons: [],
  exporting: null,
};

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampAudioSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(3, Math.max(0.25, speed));
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'media':
      return { ...state, media: action.media, crop: null, trim: null, speed: 1, keepPitch: true };
    case 'crop':
      return { ...state, crop: action.crop };
    case 'trim':
      return { ...state, trim: action.trim };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'keepPitch':
      return { ...state, keepPitch: action.keepPitch };
    case 'audio': {
      const had = state.audio !== null;
      const has = action.audio !== null;
      return {
        ...state,
        audio: action.audio,
        audioTrim: null,
        audioSpeed: 1,
        audioKeepPitch: true,
        audioVolume: has && had ? state.audioVolume : 1,
        replaceAudio: has && had ? state.replaceAudio : true,
      };
    }
    case 'audioTrim':
      return { ...state, audioTrim: action.trim };
    case 'audioSpeed':
      return { ...state, audioSpeed: clampAudioSpeed(action.speed) };
    case 'audioKeepPitch':
      return { ...state, audioKeepPitch: action.keepPitch };
    case 'audioVolume':
      return { ...state, audioVolume: clampUnit(action.volume, 1) };
    case 'replaceAudio':
      return { ...state, replaceAudio: action.replaceAudio };
    case 'goldfish':
      return { ...state, goldfish: action.goldfish };
    case 'previewMuted':
      return { ...state, previewMuted: action.previewMuted };
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

type Persisted = Pick<EditorState, 'placement' | 'captions' | 'offsets' | 'styles' | 'goldfish'>;

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
      goldfish: saved.goldfish === true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function usePersist(state: EditorState): void {
  const { placement, captions, offsets, styles, goldfish } = state;
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const data: Persisted = { placement, captions, offsets, styles, goldfish };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage can be full or blocked (private mode); persistence is best-effort.
      }
    }, 300);
    return () => clearTimeout(id);
  }, [placement, captions, offsets, styles, goldfish]);
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
  /** True while the stage shows the crop editor instead of the meme. */
  cropping: boolean;
  setCropping(cropping: boolean): void;
  cropAspect: CropAspect;
  setCropAspect(aspect: CropAspect): void;
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
  const [cropping, setCropping] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>('free');

  // Live mirror of state for event handlers that outlive a render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Release the media and custom icons when the tool is closed.
  useEffect(
    () => () => {
      const { media, customIcons, audio } = stateRef.current;
      if (media) disposeMedia(media);
      if (audio) disposeAudio(audio);
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
    setCropping(false);
    setCropAspect('free');
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
  const croppingRef = useRef(cropping);
  croppingRef.current = cropping;
  const actions = useEditorActions({ stateRef, dispatch, setMedia, atlas, canvasRef, croppingRef, notify });

  const editor: Editor = {
    ...actions,
    state,
    dispatch,
    style: state.styles[state.placement],
    icons,
    atlas,
    fontsVersion,
    busy: state.exporting !== null,
    cropping,
    setCropping,
    cropAspect,
    setCropAspect,
    canvasRef,
    fieldRefs: { top: topRef, bottom: bottomRef },
    setMedia,
    removeIcon,
    insertIcon,
    rememberField,
  };

  return <EditorContext value={editor}>{children}</EditorContext>;
}
