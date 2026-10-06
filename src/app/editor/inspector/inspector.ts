import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, viewChild,
} from '@angular/core';
import { LOW_CONFIDENCE } from '../../fiel-document/fiel-document.model';
import { OverlayPatch, fieldTitle, humanize } from '../editor.models';
import { EditorStore } from '../editor.store';
import { Icon } from '../ui/icon';

@Component({
  selector: 'fiel-inspector',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspector.html',
  styleUrl: './inspector.scss',
})
export class Inspector {
  protected readonly store = inject(EditorStore);
  protected readonly title = fieldTitle;
  protected readonly humanize = humanize;
  protected readonly lowConfidence = LOW_CONFIDENCE;

  protected readonly imageOverlay = computed(() => {
    const overlay = this.store.selectedOverlay();
    return overlay?.type === 'image' ? overlay : null;
  });
  protected readonly textOverlay = computed(() => {
    const overlay = this.store.selectedOverlay();
    return overlay?.type === 'text' ? overlay : null;
  });

  private readonly translationInput = viewChild<ElementRef<HTMLTextAreaElement>>('translation');

  constructor() {
    // Put the cursor in the translation as soon as a field is selected: review is keyboard-first.
    afterRenderEffect(() => {
      const key = this.store.selectedKey();
      const input = this.translationInput()?.nativeElement;
      if (key && input && document.activeElement !== input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value) || 0;
  }

  protected patch(patch: OverlayPatch): void {
    const overlay = this.store.selectedOverlay();
    if (overlay) this.store.updateOverlay(overlay.id, patch);
  }
}
