import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, inject, signal, viewChild,
} from '@angular/core';
import { ASSET_DRAG_TYPE, DRAG_TYPE, LibraryDragItem, PAGE_HEIGHT, PAGE_WIDTH, fieldKey } from '../editor.models';
import { EditorStore } from '../editor.store';
import { OverlayItem } from './overlay-item';

@Component({
  selector: 'fiel-page-canvas',
  imports: [OverlayItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-canvas.html',
  styleUrl: './page-canvas.scss',
})
export class PageCanvas {
  protected readonly store = inject(EditorStore);
  protected readonly pageWidth = PAGE_WIDTH;
  /** Height of all pages stacked (unscaled), so the scrollable frame matches the zoomed content. */
  protected readonly stackHeight = signal(PAGE_HEIGHT);
  protected readonly dropActive = signal(false);
  protected readonly dropTargetKey = signal<string | null>(null);
  private imageDrag: { key: string; startX: number; startPosition: number; freeSpace: number } | null = null;
  protected readonly key = fieldKey;

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly pages = viewChild.required<ElementRef<HTMLElement>>('pages');

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const stage = this.stage().nativeElement;
      const pages = this.pages().nativeElement;
      const observer = new ResizeObserver(() => {
        this.store.stageWidth.set(stage.clientWidth);
        this.stackHeight.set(Math.max(PAGE_HEIGHT, pages.offsetHeight));
      });
      observer.observe(stage);
      observer.observe(pages);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    afterRenderEffect(() => {
      const key = this.store.selectedKey();
      if (!key) return;
      this.pages().nativeElement
        .querySelector(`[data-key="${key}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    // Picking a page in the original viewer (without a field on it) brings that page into view.
    afterRenderEffect(() => {
      const page = this.store.activePage();
      if (this.store.selectedField()?.pi === page) return;
      this.pages().nativeElement
        .querySelector(`.page[data-page="${page}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  protected overlaysOn(page: number) {
    return this.store.overlays().filter(overlay => overlay.page === page);
  }

  protected startImageDrag(event: PointerEvent, key: string): void {
    const image = this.store.cellImages().get(key);
    if (!image || this.store.locked() || event.button !== 0) return;

    const element = event.target as HTMLImageElement;
    // Width actually covered by the picture inside the full-width <img> (object-fit: contain).
    const drawnWidth = Math.min(element.clientWidth, element.clientHeight * (element.naturalWidth / element.naturalHeight));
    const freeSpace = element.clientWidth - drawnWidth;
    if (freeSpace < 1) return;

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    this.imageDrag = { key, startX: event.clientX, startPosition: image.x, freeSpace };
  }

  protected dragImage(event: PointerEvent): void {
    const drag = this.imageDrag;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / this.store.zoom();
    const x = Math.round(Math.min(100, Math.max(0, drag.startPosition + (dx / drag.freeSpace) * 100)));
    this.store.updateCellImage(drag.key, { x });
  }

  protected endImageDrag(): void {
    this.imageDrag = null;
  }

  protected onStagePointerDown(event: PointerEvent): void {
    if (!(event.target as HTMLElement).closest('.cell, fiel-overlay-item')) {
      this.store.clearSelection();
    }
  }

  /** Images dropped on a field go inside it; anything dropped on empty space floats. */
  protected onDragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types ?? [];
    if (!types.includes(DRAG_TYPE) || this.store.locked()) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';

    const cell = types.includes(ASSET_DRAG_TYPE) ? (event.target as HTMLElement).closest<HTMLElement>('.cell') : null;
    this.dropTargetKey.set(cell?.dataset['key'] ?? null);
    this.dropActive.set(!cell);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!this.stage().nativeElement.contains(event.relatedTarget as Node | null)) {
      this.clearDropState();
    }
  }

  protected onDrop(event: DragEvent): void {
    const targetKey = this.dropTargetKey();
    this.clearDropState();
    const raw = event.dataTransfer?.getData(DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();

    const item = JSON.parse(raw) as LibraryDragItem;
    const { page, point } = this.dropPosition(event);
    if (item.kind === 'block') {
      this.store.addText(item.preset, point, page);
      return;
    }

    const asset = this.store.assets().find(a => a.id === item.id);
    if (!asset) return;
    if (targetKey) this.store.embedImage(targetKey, asset);
    else this.store.addImage(asset, point, page);
  }

  /** The page under the pointer (or the nearest one when dropped between pages) and the point on it. */
  private dropPosition(event: DragEvent): { page: number; point: { x: number; y: number } } {
    const sheets = Array.from(this.pages().nativeElement.querySelectorAll<HTMLElement>('.page'));
    const target = (event.target as HTMLElement).closest<HTMLElement>('.page')
      ?? sheets.reduce((best, sheet) => (distanceY(sheet, event) < distanceY(best, event) ? sheet : best));
    const rect = target.getBoundingClientRect();
    const zoom = this.store.zoom();
    return {
      page: Number(target.dataset['page']),
      point: { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom },
    };
  }

  private clearDropState(): void {
    this.dropActive.set(false);
    this.dropTargetKey.set(null);
  }
}

function distanceY(element: HTMLElement, event: MouseEvent): number {
  const rect = element.getBoundingClientRect();
  return event.clientY < rect.top ? rect.top - event.clientY : Math.max(0, event.clientY - rect.bottom);
}
