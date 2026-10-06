import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Overlay } from '../editor.models';
import { EditorStore } from '../editor.store';

type DragAction = 'move' | 'resize';

interface DragState {
  action: DragAction;
  startX: number;
  startY: number;
  origin: Pick<Overlay, 'x' | 'y' | 'width' | 'height'>;
}

/** A free element on the page (seal, signature, image or text) that can be moved and resized. */
@Component({
  selector: 'fiel-overlay-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (image(); as img) {
      <img [src]="img.src" [alt]="img.name" draggable="false" [style.mix-blend-mode]="img.inkBlend ? 'multiply' : null" />
    }
    @if (text(); as t) {
      <div class="text" [style.font-size.px]="t.fontSize" [style.font-weight]="t.bold ? 700 : 400" [style.text-align]="t.align">{{ t.text }}</div>
    }
    @if (selected() && !store.locked()) {
      <span class="handle" (pointerdown)="startDrag($event, 'resize')"></span>
    }
  `,
  styleUrl: './overlay-item.scss',
  host: {
    '[style.left.px]': 'overlay().x',
    '[style.top.px]': 'overlay().y',
    '[style.width.px]': 'overlay().width',
    '[style.height.px]': "overlay().type === 'image' ? overlay().height : null",
    '[style.opacity]': 'overlay().opacity',
    '[style.transform]': "'rotate(' + overlay().rotation + 'deg)'",
    '[class.selected]': 'selected()',
    '[class.editable]': '!store.locked()',
    '(pointerdown)': 'startDrag($event, "move")',
    '(pointermove)': 'drag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class OverlayItem {
  readonly overlay = input.required<Overlay>();

  protected readonly store = inject(EditorStore);
  protected readonly selected = computed(() => this.store.selectedOverlay()?.id === this.overlay().id);
  protected readonly image = computed(() => {
    const overlay = this.overlay();
    return overlay.type === 'image' ? overlay : null;
  });
  protected readonly text = computed(() => {
    const overlay = this.overlay();
    return overlay.type === 'text' ? overlay : null;
  });

  private dragState: DragState | null = null;

  protected startDrag(event: PointerEvent, action: DragAction): void {
    event.stopPropagation();
    this.store.selectOverlay(this.overlay().id);
    if (this.store.locked() || event.button !== 0) return;

    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    const { x, y, width, height } = this.overlay();
    this.dragState = { action, startX: event.clientX, startY: event.clientY, origin: { x, y, width, height } };
  }

  protected drag(event: PointerEvent): void {
    const state = this.dragState;
    if (!state) return;

    const zoom = this.store.zoom();
    const dx = (event.clientX - state.startX) / zoom;
    const dy = (event.clientY - state.startY) / zoom;
    const { origin } = state;

    if (state.action === 'move') {
      this.store.updateOverlay(this.overlay().id, { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) });
      return;
    }

    const width = Math.max(24, Math.round(origin.width + dx));
    const height = this.overlay().type === 'image'
      ? Math.round(width * (origin.height / origin.width))
      : Math.max(24, Math.round(origin.height + dy));
    this.store.updateOverlay(this.overlay().id, { width, height });
  }

  protected endDrag(): void {
    this.dragState = null;
  }
}
