import { Injectable, computed, signal } from '@angular/core';
import { SavedReview } from '../core/api.models';
import { FielCell, FielDocument, FielDocumentEntry, FielText } from '../fiel-document/fiel-document.model';
import {
  Asset, CellImage, CropRequest, EditorMode, FieldRef, Overlay, OverlayPatch, PAGE_WIDTH,
  PageBackground, SAMPLE_ASSETS, Selection, TEXT_PRESETS, TextPreset, clamp, fieldIssues, fieldKey, humanize,
} from './editor.models';

const CELL_IMAGE_HEIGHT = 72;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

/** Single source of truth for one editing session. Provided per editor page. */
@Injectable()
export class EditorStore {
  /** Documents available to open (demo/index.json). */
  readonly documents = signal<FielDocumentEntry[]>([]);
  readonly source = signal<FielDocumentEntry | null>(null);
  readonly document = signal<FielDocument | null>(null);
  /** Page shown in the original viewer (0-based); follows the selected field. */
  readonly activePage = signal(0);
  readonly mode = signal<EditorMode>('review');
  readonly selection = signal<Selection>(null);
  readonly verified = signal<ReadonlySet<string>>(new Set());
  readonly edited = signal<ReadonlySet<string>>(new Set());
  readonly overlays = signal<Overlay[]>([]);
  readonly cellImages = signal<ReadonlyMap<string, CellImage>>(new Map());
  readonly cropRequest = signal<CropRequest | null>(null);
  readonly assets = signal<Asset[]>(SAMPLE_ASSETS);
  readonly approved = signal(false);
  readonly toast = signal<string | null>(null);

  readonly pageBackground = signal<PageBackground | null>(null);
  /** Set when the document comes from the API (saving and approval go to the server). */
  readonly remoteId = signal<string | null>(null);
  readonly attachOriginal = signal(true);
  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);

  /** Width of the canvas area, measured by the page canvas; drives "fit to width". */
  readonly stageWidth = signal(0);
  private readonly manualZoom = signal<number | null>(null);

  readonly zoom = computed(
    () => this.manualZoom() ?? clamp((this.stageWidth() - 80) / PAGE_WIDTH, MIN_ZOOM, 1.25),
  );
  readonly locked = computed(() => this.approved() || this.mode() === 'preview');

  readonly pages = computed(() => this.document()?.pages ?? []);
  readonly currentPage = computed(() => this.pages()[this.activePage()] ?? null);

  readonly fields = computed<FieldRef[]>(() =>
    this.pages().flatMap((page, pi) =>
      page.sections.flatMap((section, si) =>
        section.rows.flatMap((row, ri) =>
          row.cells.map((cell, ci) => ({
            key: fieldKey(pi, si, ri, ci),
            pi, si, ri, ci, cell,
            pageNumber: page.page_number,
            section: section.title?.translated || humanize(section.id),
            issues: fieldIssues(cell),
          })),
        ),
      ),
    ),
  );

  readonly verifiedCount = computed(() => this.fields().filter(f => this.verified().has(f.key)).length);
  readonly attentionCount = computed(
    () => this.fields().filter(f => f.issues.length > 0 && !this.verified().has(f.key)).length,
  );
  readonly allVerified = computed(() => this.fields().length > 0 && this.verifiedCount() === this.fields().length);

  readonly selectedKey = computed(() => {
    const selection = this.selection();
    return selection?.type === 'field' ? selection.key : null;
  });
  readonly selectedField = computed(() => this.fields().find(f => f.key === this.selectedKey()) ?? null);
  readonly selectedOverlay = computed(() => {
    const selection = this.selection();
    return selection?.type === 'overlay' ? this.overlays().find(o => o.id === selection.id) ?? null : null;
  });

  /**
   * Every editable piece of state is replaced (never mutated) on change, so comparing references
   * against the last saved snapshot tells whether there are unsaved changes, at no cost.
   */
  private readonly savedSnapshot = signal<readonly unknown[]>([]);
  private readonly currentSnapshot = computed(() => [
    this.document(), this.verified(), this.edited(), this.overlays(), this.cellImages(), this.pageBackground(),
  ]);
  readonly dirty = computed(() => {
    const saved = this.savedSnapshot();
    return this.currentSnapshot().some((part, i) => part !== saved[i]);
  });

  private toastTimer?: ReturnType<typeof setTimeout>;

  load(source: FielDocumentEntry, doc: FielDocument, remoteId: string | null = null): void {
    this.remoteId.set(remoteId);
    this.source.set(source);
    this.document.set(doc);
    this.activePage.set(0);
    this.selection.set(null);
    this.verified.set(new Set());
    this.edited.set(new Set());
    this.overlays.set([]);
    this.cellImages.set(new Map());
    this.cropRequest.set(null);
    this.approved.set(false);
    this.mode.set('review');
    this.manualZoom.set(null);
    this.markSaved();
  }

  /** Puts back what a translator saved earlier: verified fields, page elements, images... */
  restoreReview(review: SavedReview, approved: boolean): void {
    this.verified.set(new Set(review.verified ?? []));
    this.edited.set(new Set(review.edited ?? []));
    this.overlays.set(((review.overlays ?? []) as Overlay[]).map(o => ({ ...o, page: o.page ?? 0 })));
    this.cellImages.set(new Map(Object.entries((review.cellImages ?? {}) as Record<string, CellImage>)));
    if (review.pageBackground) this.pageBackground.set(review.pageBackground as PageBackground);
    this.approved.set(approved);
    this.markSaved();
  }

  markSaved(): void {
    this.savedSnapshot.set(this.currentSnapshot());
  }

  /** Corrected document + review state, as saved to the API or exported as JSON. */
  reviewPayload(): { document: FielDocument; review: SavedReview } | null {
    const doc = this.document();
    if (!doc) return null;
    return {
      document: doc,
      review: {
        approved: this.approved(),
        verified: [...this.verified()],
        edited: [...this.edited()],
        overlays: this.overlays(),
        cellImages: Object.fromEntries(this.cellImages()),
        pageBackground: this.pageBackground(),
      },
    };
  }

  // ---------- Selection & review flow ----------

  selectField(key: string): void {
    this.selection.set({ type: 'field', key });
    const field = this.fields().find(f => f.key === key);
    if (field) this.activePage.set(field.pi);
  }

  showPage(index: number): void {
    if (index < 0 || index >= this.pages().length) return;
    this.activePage.set(index);
    if (this.selectedField()?.pi !== index) this.clearSelection();
  }

  selectOverlay(id: string): void {
    this.selection.set({ type: 'overlay', id });
  }

  clearSelection(): void {
    this.selection.set(null);
  }

  moveSelection(step: 1 | -1): void {
    const fields = this.fields();
    if (!fields.length) return;
    const current = fields.findIndex(f => f.key === this.selectedKey());
    const next = current === -1
      ? (step === 1 ? 0 : fields.length - 1)
      : (current + step + fields.length) % fields.length;
    this.selectField(fields[next].key);
  }

  isVerified(key: string): boolean {
    return this.verified().has(key);
  }

  verifyAndNext(): void {
    const field = this.selectedField();
    if (!field || this.locked()) return;

    this.verified.update(keys => new Set(keys).add(field.key));

    const fields = this.fields();
    const start = fields.findIndex(f => f.key === field.key);
    for (let i = 1; i < fields.length; i++) {
      const candidate = fields[(start + i) % fields.length];
      if (!this.verified().has(candidate.key)) {
        this.selectField(candidate.key);
        return;
      }
    }
    this.notify('All fields verified · ready to approve');
  }

  unverify(key: string): void {
    if (this.locked()) return;
    this.verified.update(keys => {
      const next = new Set(keys);
      next.delete(key);
      return next;
    });
  }

  // ---------- Field edits ----------

  updateText(key: string, part: 'label' | 'value', translated: string): void {
    this.editCell(key, cell => (cell[part] = withTranslation(cell[part], translated)));
  }

  useOriginal(key: string): void {
    this.editCell(key, cell => {
      if (cell.value) cell.value.translated = cell.value.original;
    });
  }

  toggleChecked(key: string): void {
    this.editCell(key, cell => (cell.checked = !cell.checked));
  }

  private editCell(key: string, change: (cell: FielCell) => void): void {
    const doc = this.document();
    const field = this.fields().find(f => f.key === key);
    if (!doc || !field || this.locked()) return;

    const copy = structuredClone(doc);
    change(copy.pages[field.pi].sections[field.si].rows[field.ri].cells[field.ci]);
    this.document.set(copy);
    this.edited.update(keys => new Set(keys).add(key));
  }

  // ---------- Free elements (overlays) ----------

  /** Adds a floating image on `page` (default: the page shown in the original viewer). */
  addImage(asset: Asset, center?: { x: number; y: number }, page = this.activePage()): void {
    const width = asset.defaultWidth;
    const height = Math.round(width * asset.ratio);
    this.addOverlay({
      id: newId(), type: 'image', name: asset.name, src: asset.src, inkBlend: true, page,
      width, height, rotation: 0, opacity: 1, ...this.placement(page, width, height, center),
    });
  }

  addText(preset: TextPreset, center?: { x: number; y: number }, page = this.activePage()): void {
    const { width, fontSize, text } = TEXT_PRESETS[preset];
    const height = 40;
    this.addOverlay({
      id: newId(), type: 'text', text: text(), fontSize, bold: false, align: 'left', page,
      width, height, rotation: 0, opacity: 1, ...this.placement(page, width, height, center),
    });
  }

  updateOverlay(id: string, patch: OverlayPatch): void {
    if (this.locked()) return;
    this.overlays.update(list => list.map(o => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)));
  }

  removeOverlay(id: string): void {
    if (this.locked()) return;
    this.overlays.update(list => list.filter(o => o.id !== id));
    this.clearSelection();
  }

  duplicateOverlay(id: string): void {
    const original = this.overlays().find(o => o.id === id);
    if (original) this.addOverlay({ ...original, id: newId(), x: original.x + 16, y: original.y + 16 });
  }

  reorderOverlay(id: string, toFront: boolean): void {
    this.overlays.update(list => {
      const item = list.find(o => o.id === id);
      if (!item) return list;
      const rest = list.filter(o => o.id !== id);
      return toFront ? [...rest, item] : [item, ...rest];
    });
  }

  private addOverlay(overlay: Overlay): void {
    if (this.locked()) return;
    this.overlays.update(list => [...list, overlay]);
    this.selectOverlay(overlay.id);
  }

  private placement(page: number, width: number, height: number, center?: { x: number; y: number }) {
    const offset = (this.overlays().filter(o => o.page === page).length % 6) * 16;
    const x = center ? center.x - width / 2 : (PAGE_WIDTH - width) / 2 + offset;
    const y = center ? center.y - height / 2 : 96 + offset;
    return { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)) };
  }

  // ---------- Images inside fields ----------

  embedImage(key: string, image: { name: string; src: string }): void {
    if (this.locked()) return;
    this.cellImages.update(map =>
      new Map(map).set(key, { ...image, height: CELL_IMAGE_HEIGHT, x: 50, inkBlend: true, showNote: true }),
    );
    this.edited.update(keys => new Set(keys).add(key));
    this.selectField(key);
    this.notify('Image placed inside the field');
  }

  updateCellImage(key: string, patch: Partial<CellImage>): void {
    const current = this.cellImages().get(key);
    if (!current || this.locked()) return;
    this.cellImages.update(map => new Map(map).set(key, { ...current, ...patch }));
  }

  removeCellImage(key: string): void {
    if (this.locked()) return;
    this.cellImages.update(map => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  // ---------- Cropping from the original ----------

  startCrop(request: CropRequest): void {
    if (!this.locked()) this.cropRequest.set(request);
  }

  cancelCrop(): void {
    this.cropRequest.set(null);
  }

  /** Called by the original viewer once the user has drawn a rectangle. */
  async completeCrop(box: number[]): Promise<void> {
    const request = this.cropRequest();
    const page = this.currentPage();
    this.cropRequest.set(null);
    if (!request || !page) return;

    const crop = await cropImage(page.image, box);
    if (request.target === 'cell') {
      this.embedImage(request.key, { name: 'Crop from original', src: crop.src });
      return;
    }
    const count = this.assets().filter(a => a.name.startsWith('Crop ')).length + 1;
    this.assets.update(list => [
      ...list,
      { id: newId(), name: `Crop ${count}`, src: crop.src, ratio: crop.ratio, defaultWidth: 160 },
    ]);
    this.notify('Crop added to Library');
  }

  /** One click: crop the area Gemini reported for this field and place it inside the field. */
  async useSuggestedCrop(key: string): Promise<void> {
    const field = this.fields().find(f => f.key === key);
    const page = field ? this.pages()[field.pi] : null;
    const box = field?.cell.box;
    if (!page || !box || box.length !== 4 || this.locked()) return;

    const crop = await cropImage(page.image, box, 12);
    this.embedImage(key, { name: 'Crop from original', src: crop.src });
  }

  // ---------- Assets ----------

  async addAssetFiles(fileList: FileList): Promise<void> {
    // Copy first: the caller clears the <input>, which empties the live FileList.
    const files = Array.from(fileList);
    for (const file of files) {
      const src = await readAsDataUrl(file);
      const ratio = await imageRatio(src);
      this.assets.update(list => [
        ...list,
        { id: newId(), name: file.name.replace(/\.[^.]+$/, ''), src, ratio, defaultWidth: 160 },
      ]);
    }
    this.notify(files.length === 1 ? 'Asset added' : `${files.length} assets added`);
  }

  removeAsset(id: string): void {
    this.assets.update(list => list.filter(a => a.id !== id || a.builtIn));
  }

  setPageBackground(asset: Asset): void {
    if (this.locked()) return;
    this.pageBackground.set({ name: asset.name, src: asset.src, opacity: 1 });
    this.notify('Page background applied');
  }

  // ---------- Layout ----------

  togglePanels(): void {
    const open = !(this.leftPanelOpen() || this.rightPanelOpen());
    this.leftPanelOpen.set(open);
    this.rightPanelOpen.set(open);
  }

  // ---------- View ----------

  zoomBy(delta: number): void {
    this.manualZoom.set(clamp(Math.round((this.zoom() + delta) * 10) / 10, MIN_ZOOM, MAX_ZOOM));
  }

  zoomToFit(): void {
    this.manualZoom.set(null);
  }

  // ---------- Approval & export ----------

  approve(): void {
    if (!this.allVerified()) {
      this.notify('Verify every field before approving');
      return;
    }
    this.approved.set(true);
    this.clearSelection();
    this.notify('Approved · this version is now locked');
  }

  reopen(): void {
    this.approved.set(false);
    this.notify('Reopened for changes');
  }

  /** Uses the browser's print engine: vector text, exact layout, "Save as PDF" destination. */
  exportPdf(): void {
    const source = this.source();
    if (!source) return;

    this.clearSelection();
    const previousTitle = document.title;
    document.title = this.baseName(source) + (this.approved() ? '-certified-translation' : '-draft');

    // Let the deselection render before the print snapshot is taken.
    requestAnimationFrame(() =>
      setTimeout(() => {
        window.print();
        document.title = previousTitle;
      }, 50),
    );
  }

  exportJson(): void {
    const payload = this.reviewPayload();
    const source = this.source();
    if (!payload || !source) return;

    const name = this.baseName(source) + '.fiel.reviewed.json';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** File-name friendly document name, e.g. "FD-7KQ2MX" or "eucaris-documents". */
  private baseName(source: FielDocumentEntry): string {
    return source.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  }

  notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2400);
  }
}

function withTranslation(text: FielText | null | undefined, translated: string): FielText {
  return { original: text?.original ?? '', is_literal: text?.is_literal ?? false, translated };
}

function newId(): string {
  return crypto.randomUUID();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Crops a region of an image. `box` is [ymin, xmin, ymax, xmax] on a 0-1000 scale;
 * `padding` (same scale) gives approximate AI boxes some breathing room. Output is PNG.
 */
async function cropImage(url: string, box: number[], padding = 0): Promise<{ src: string; ratio: number }> {
  const image = await loadImage(url);
  const [ymin, xmin, ymax, xmax] = box.map((v, i) => clamp(v + (i < 2 ? -padding : padding), 0, 1000) / 1000);
  const sx = xmin * image.naturalWidth;
  const sy = ymin * image.naturalHeight;
  const sw = Math.max(1, (xmax - xmin) * image.naturalWidth);
  const sh = Math.max(1, (ymax - ymin) * image.naturalHeight);
  const scale = Math.min(1, 1400 / sw);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL('image/png'), ratio: sh / sw };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

function imageRatio(src: string): Promise<number> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth ? image.naturalHeight / image.naturalWidth : 1);
    image.onerror = () => resolve(1);
    image.src = src;
  });
}
