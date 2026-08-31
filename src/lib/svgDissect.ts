const UNSAFE_TAGS = new Set(['script', 'foreignobject']);

const INSPECTABLE_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
  'image',
  'defs',
]);

const DRAGGABLE_TAGS = new Set([
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
  'image',
]);

const DEFS_CHILD_TAGS = new Set([
  'lineargradient',
  'radialgradient',
  'pattern',
  'clippath',
  'mask',
  'filter',
  'marker',
  'symbol',
  'style',
]);

export class SvgLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgLoadError';
  }
}

function sanitizeNode(node: Element): void {
  if (UNSAFE_TAGS.has(node.tagName.toLowerCase())) {
    node.remove();
    return;
  }

  for (const attribute of [...node.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || attribute.value.trim().toLowerCase().startsWith('javascript:')) {
      node.removeAttribute(attribute.name);
    }
  }

  for (const child of [...node.children]) sanitizeNode(child);
}

export async function loadSvgFile(file: File): Promise<SVGSVGElement> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new SvgLoadError('Invalid SVG: could not parse XML.');
  }

  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') {
    throw new SvgLoadError('File does not contain a root <svg> element.');
  }

  sanitizeNode(svg);
  const imported = document.importNode(svg, true) as unknown as SVGSVGElement;
  if (!imported.getAttribute('viewBox')) {
    const width = Number.parseFloat(imported.getAttribute('width') ?? '');
    const height = Number.parseFloat(imported.getAttribute('height') ?? '');
    if (Number.isFinite(width) && Number.isFinite(height)) {
      imported.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
  }
  return imported;
}

export interface RegistryNode {
  id: string;
  element: SVGElement;
  tag: string;
  label: string;
  children: RegistryNode[];
  draggable: boolean;
}

let idCounter = 0;

function isInsideDefs(element: Element): boolean {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName.toLowerCase() === 'defs') return true;
    parent = parent.parentElement;
  }
  return false;
}

function walkElement(element: Element, nodes: RegistryNode[]): RegistryNode | null {
  const tag = element.tagName.toLowerCase();
  if (!INSPECTABLE_TAGS.has(tag)) {
    for (const child of [...element.children]) walkElement(child, nodes);
    return null;
  }

  const id = `d${++idCounter}`;
  element.setAttribute('data-dissect-id', id);
  const sourceId = element.getAttribute('id');
  const firstClass = element.getAttribute('class')?.trim().split(/\s+/)[0];
  const node: RegistryNode = {
    id,
    element: element as SVGElement,
    tag,
    label: `${tag}${sourceId ? `#${sourceId}` : ''}${firstClass ? `.${firstClass}` : ''}`,
    children: [],
    draggable: DRAGGABLE_TAGS.has(tag) && !DEFS_CHILD_TAGS.has(tag) && !isInsideDefs(element),
  };

  for (const child of [...element.children]) walkElement(child, node.children);
  nodes.push(node);
  return node;
}

export class ElementRegistry {
  readonly root: RegistryNode | null;
  private readonly byId = new Map<string, RegistryNode>();

  constructor(svg: SVGSVGElement) {
    idCounter = 0;
    const nodes: RegistryNode[] = [];
    walkElement(svg, nodes);
    this.root = nodes[0] ?? null;
    const index = (node: RegistryNode) => {
      this.byId.set(node.id, node);
      for (const child of node.children) index(child);
    };
    if (this.root) index(this.root);
  }

  get(id: string): RegistryNode | undefined {
    return this.byId.get(id);
  }

  findByElement(element: Element | null): RegistryNode | undefined {
    let current = element;
    while (current) {
      const id = current.getAttribute('data-dissect-id');
      if (id) return this.byId.get(id);
      current = current.parentElement;
    }
    return undefined;
  }

  findAtPoint(svg: SVGSVGElement, clientX: number, clientY: number): RegistryNode | undefined {
    const hit = document.elementFromPoint(clientX, clientY);
    return hit && svg.contains(hit) ? this.findByElement(hit) : undefined;
  }
}

interface TransformEntry {
  baseline: string;
  dx: number;
  dy: number;
}

export class TransformStore {
  private readonly entries = new Map<string, TransformEntry>();

  private ensure(id: string, element: SVGElement): TransformEntry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { baseline: element.getAttribute('transform') ?? '', dx: 0, dy: 0 };
      this.entries.set(id, entry);
    }
    return entry;
  }

  getOffset(id: string): { dx: number; dy: number } {
    const entry = this.entries.get(id);
    return entry ? { dx: entry.dx, dy: entry.dy } : { dx: 0, dy: 0 };
  }

  hasMoved(id: string): boolean {
    const entry = this.entries.get(id);
    return !!entry && (entry.dx !== 0 || entry.dy !== 0);
  }

  setOffset(id: string, element: SVGElement, dx: number, dy: number): void {
    const entry = this.ensure(id, element);
    entry.dx = dx;
    entry.dy = dy;
    const transform = [entry.baseline, dx !== 0 || dy !== 0 ? `translate(${dx}, ${dy})` : '']
      .filter(Boolean)
      .join(' ');
    if (transform) element.setAttribute('transform', transform);
    else element.removeAttribute('transform');
  }

  resetElement(id: string, element: SVGElement): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.dx = 0;
    entry.dy = 0;
    if (entry.baseline) element.setAttribute('transform', entry.baseline);
    else element.removeAttribute('transform');
  }

  resetAll(registry: ElementRegistry): void {
    for (const [id, entry] of this.entries) {
      const node = registry.get(id);
      if (!node) continue;
      entry.dx = 0;
      entry.dy = 0;
      if (entry.baseline) node.element.setAttribute('transform', entry.baseline);
      else node.element.removeAttribute('transform');
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface InteractionCallbacks {
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onTooltip: (node: RegistryNode | null, x: number, y: number) => void;
  onContextMenu: (node: RegistryNode, x: number, y: number) => void;
}

export class InteractionController {
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private dragNode: RegistryNode | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragInitialDx = 0;
  private dragInitialDy = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly registry: ElementRegistry,
    private readonly transforms: TransformStore,
    private readonly callbacks: InteractionCallbacks,
  ) {
    svg.addEventListener('pointerdown', this.onPointerDown);
    svg.addEventListener('pointermove', this.onPointerMove);
    svg.addEventListener('pointerup', this.onPointerUp);
    svg.addEventListener('pointercancel', this.onPointerUp);
    svg.addEventListener('contextmenu', this.onContextMenu);
    svg.addEventListener('mousemove', this.onMouseMove);
    svg.addEventListener('mouseleave', this.onMouseLeave);
    svg.addEventListener('click', this.onClick);
  }

  destroy(): void {
    this.svg.removeEventListener('pointerdown', this.onPointerDown);
    this.svg.removeEventListener('pointermove', this.onPointerMove);
    this.svg.removeEventListener('pointerup', this.onPointerUp);
    this.svg.removeEventListener('pointercancel', this.onPointerUp);
    this.svg.removeEventListener('contextmenu', this.onContextMenu);
    this.svg.removeEventListener('mousemove', this.onMouseMove);
    this.svg.removeEventListener('mouseleave', this.onMouseLeave);
    this.svg.removeEventListener('click', this.onClick);
  }

  select(id: string | null): void {
    if (this.selectedId) this.registry.get(this.selectedId)?.element.classList.remove('dissect-selected');
    this.selectedId = id;
    if (id) this.registry.get(id)?.element.classList.add('dissect-selected');
    this.callbacks.onSelect(id);
  }

  hover(id: string | null): void {
    if (this.hoveredId) this.registry.get(this.hoveredId)?.element.classList.remove('dissect-hover');
    this.hoveredId = id;
    if (id && id !== this.selectedId) this.registry.get(id)?.element.classList.add('dissect-hover');
    this.callbacks.onHover(id);
  }

  private screenToSvgDelta(dx: number, dy: number): { x: number; y: number } {
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return { x: dx, y: dy };
    return {
      x: dx / (Math.hypot(matrix.a, matrix.b) || 1),
      y: dy / (Math.hypot(matrix.c, matrix.d) || 1),
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const node = this.registry.findAtPoint(this.svg, event.clientX, event.clientY);
    if (!node?.draggable) return;
    event.preventDefault();
    this.select(node.id);
    this.dragNode = node;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    const offset = this.transforms.getOffset(node.id);
    this.dragInitialDx = offset.dx;
    this.dragInitialDy = offset.dy;
    node.element.classList.add('dissect-dragging');
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragNode) return;
    const delta = this.screenToSvgDelta(event.clientX - this.dragStartX, event.clientY - this.dragStartY);
    this.transforms.setOffset(
      this.dragNode.id,
      this.dragNode.element,
      this.dragInitialDx + delta.x,
      this.dragInitialDy + delta.y,
    );
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragNode) return;
    this.dragNode.element.classList.remove('dissect-dragging');
    this.dragNode = null;
    try {
      (event.target as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const node = this.registry.findAtPoint(this.svg, event.clientX, event.clientY);
    if (!node) return;
    event.preventDefault();
    this.select(node.id);
    this.callbacks.onContextMenu(node, event.clientX, event.clientY);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.dragNode) return;
    const node = this.registry.findAtPoint(this.svg, event.clientX, event.clientY);
    this.hover(node?.id ?? null);
    this.callbacks.onTooltip(node ?? null, event.clientX, event.clientY);
  };

  private readonly onMouseLeave = (): void => {
    if (this.dragNode) return;
    this.hover(null);
    this.callbacks.onTooltip(null, 0, 0);
  };

  private readonly onClick = (event: MouseEvent): void => {
    this.select(this.registry.findAtPoint(this.svg, event.clientX, event.clientY)?.id ?? null);
  };
}

export function describeNode(
  node: RegistryNode,
  measureDimensions = true,
): { id: string | null; classes: string[]; dimensions: string } {
  let dimensions = '—';
  if (measureDimensions) {
    try {
      const graphics = node.element as SVGGraphicsElement;
      if ('getBBox' in graphics) {
        const box = graphics.getBBox();
        dimensions = `${Math.round(box.width)}×${Math.round(box.height)}`;
      }
    } catch {
      // Some non-rendered SVG nodes (such as defs) do not expose a bounding box.
    }
  }
  return {
    id: node.element.getAttribute('id'),
    classes:
      node.element
        .getAttribute('class')
        ?.trim()
        .split(/\s+/)
        .filter((className) => className && !className.startsWith('dissect-')) ?? [],
    dimensions,
  };
}
