import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, output, signal,
  untracked, viewChild,
} from '@angular/core';
import { boxToPercentStyle, clamp } from '../editor.models';
import { EditorStore } from '../editor.store';
import { Icon } from '../../shared/icon';

interface View {
  x: number;
  y: number;
  scale: number;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: View;
  moved: boolean;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const PAN_THRESHOLD = 4;

@Component({
  selector: 'fiel-source-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './source-view.html',
  styleUrl: './source-view.scss',
})
export class SourceView {
  readonly hide = output<void>();

  protected readonly store = inject(EditorStore);
  protected readonly follow = signal(true);
  protected readonly panning = signal(false);
  protected readonly boxStyle = boxToPercentStyle;

  /** While a crop is requested, dragging draws a selection instead of panning. */
  protected readonly cropping = computed(() => this.store.cropRequest() !== null);
  protected readonly cropTarget = computed(() => {
    const request = this.store.cropRequest();
    return request?.target === 'cell' ? 'the selected field' : 'the Library';
  });
  /** Selection being drawn, [ymin, xmin, ymax, xmax] on a 0-1000 scale. */
  protected readonly cropDraft = signal<number[] | null>(null);
  private cropStart: { x: number; y: number } | null = null;

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');
  private readonly viewportSize = signal({ width: 0, height: 0 });
  /** Natural image height / width. */
  private readonly imageRatio = signal(1);
  /** Set when the user pans or zooms by hand; cleared to go back to the automatic view. */
  private readonly manualView = signal<View | null>(null);
  private pan: PanState | null = null;

  protected readonly boxedFields = computed(() =>
    this.store.fields().filter(f => f.pi === this.store.activePage() && f.cell.box?.length === 4),
  );

  /** Fits the whole image, or zooms into the selected field when "Follow" is on. */
  private readonly autoView = computed<View>(() => {
    const { width: vw, height: vh } = this.viewportSize();
    if (!vw || !vh) return { x: 0, y: 0, scale: 1 };

    const iw = vw;
    const ih = vw * this.imageRatio();
    const box = this.store.selectedField()?.cell.box;

    if (!this.follow() || !box || box.length !== 4) {
      const scale = Math.min(1, (vh - 32) / ih);
      return { x: (vw - iw * scale) / 2, y: 16, scale };
    }

    const [ymin, xmin, ymax, xmax] = box.map(v => v / 1000);
    const boxWidth = Math.max(xmax - xmin, 0.08) * iw;
    const boxHeight = Math.max(ymax - ymin, 0.04) * ih;
    const scale = clamp(Math.min((vw * 0.75) / boxWidth, (vh * 0.45) / boxHeight), 1, 4);
    return {
      x: vw / 2 - ((xmin + xmax) / 2) * iw * scale,
      y: vh / 2 - ((ymin + ymax) / 2) * ih * scale,
      scale,
    };
  });

  protected readonly view = computed(() => this.manualView() ?? this.autoView());
  protected readonly isManual = computed(() => this.manualView() !== null);
  protected readonly zoomPercent = computed(() => Math.round(this.view().scale * 100));
  protected readonly transform = computed(() => {
    const { x, y, scale } = this.view();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) =>
        this.viewportSize.set({ width: entry.contentRect.width, height: entry.contentRect.height }),
      );
      observer.observe(this.viewport().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    // In Follow mode, selecting another field takes over from any manual pan/zoom.
    effect(() => {
      this.store.selectedKey();
      if (untracked(this.follow)) this.manualView.set(null);
    });

    // A different page starts from its automatic view.
    effect(() => {
      this.store.activePage();
      this.manualView.set(null);
    });
  }

  protected setFollow(follow: boolean): void {
    this.follow.set(follow);
    this.manualView.set(null);
  }

  protected zoomBy(factor: number): void {
    const { width, height } = this.viewportSize();
    this.zoomAround(width / 2, height / 2, factor);
  }

  protected onImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.imageRatio.set(image.naturalHeight / image.naturalWidth);
  }

  /** Pinch or ⌘/Ctrl + wheel zooms around the cursor; a plain wheel or trackpad scroll pans. */
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.viewport().nativeElement.getBoundingClientRect();

    if (event.ctrlKey || event.metaKey) {
      // Clamped so a mouse-wheel notch (~100) and a trackpad pinch (~2-10) both feel smooth.
      const factor = Math.exp(-clamp(event.deltaY, -60, 60) * 0.005);
      this.zoomAround(event.clientX - rect.left, event.clientY - rect.top, factor);
      return;
    }
    const view = this.view();
    this.manualView.set({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as Element).closest('.crop-banner, .pager')) return;

    if (this.cropping()) {
      const point = this.imagePoint(event);
      if (!point) return;
      event.preventDefault();
      this.cropStart = point;
      this.cropDraft.set([point.y, point.x, point.y, point.x]);
      this.viewport().nativeElement.setPointerCapture(event.pointerId);
      return;
    }

    this.pan = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: this.view(), moved: false };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.cropStart) {
      const point = this.imagePoint(event);
      if (!point) return;
      const start = this.cropStart;
      this.cropDraft.set([
        Math.min(start.y, point.y), Math.min(start.x, point.x),
        Math.max(start.y, point.y), Math.max(start.x, point.x),
      ]);
      return;
    }

    const pan = this.pan;
    if (!pan) return;

    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      // Capture only once it is clearly a drag, so a simple click still selects a region.
      pan.moved = true;
      this.panning.set(true);
      this.viewport().nativeElement.setPointerCapture(pan.pointerId);
    }
    this.manualView.set({ ...pan.origin, x: pan.origin.x + dx, y: pan.origin.y + dy });
  }

  protected onPointerUp(): void {
    if (this.cropStart) {
      const box = this.cropDraft();
      this.cropStart = null;
      this.cropDraft.set(null);
      // Ignore accidental clicks; a crop needs a visible area.
      if (box && box[2] - box[0] > 5 && box[3] - box[1] > 5) this.store.completeCrop(box);
      return;
    }
    this.pan = null;
    this.panning.set(false);
  }

  /** Pointer position on the image in the 0-1000 box scale, clamped to the image. */
  private imagePoint(event: PointerEvent): { x: number; y: number } | null {
    const image = this.image()?.nativeElement;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 1000, 0, 1000),
      y: clamp(((event.clientY - rect.top) / rect.height) * 1000, 0, 1000),
    };
  }

  protected resetView(): void {
    this.manualView.set(null);
  }

  private zoomAround(px: number, py: number, factor: number): void {
    const view = this.view();
    const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = scale / view.scale;
    this.manualView.set({ x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, scale });
  }
}
