import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FielDocumentEntry } from '../../fiel-document/fiel-document.model';
import { EditorStore } from '../editor.store';
import { Icon } from '../ui/icon';

@Component({
  selector: 'fiel-top-bar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  host: { '(document:pointerdown)': 'closeMenuOnOutsideClick($event)' },
})
export class TopBar {
  readonly openDocument = output<FielDocumentEntry>();

  protected readonly store = inject(EditorStore);
  protected readonly exportOpen = signal(false);

  protected exportPdf(): void {
    this.exportOpen.set(false);
    this.store.exportPdf();
  }

  protected exportJson(): void {
    this.exportOpen.set(false);
    this.store.exportJson();
  }

  protected closeMenuOnOutsideClick(event: PointerEvent): void {
    const target = event.target as Element;
    if (this.exportOpen() && !target.closest('.export')) {
      this.exportOpen.set(false);
    }
  }

  protected readonly progress = computed(() => {
    const total = this.store.fields().length;
    return total ? (this.store.verifiedCount() / total) * 100 : 0;
  });
  protected readonly zoomPercent = computed(() => Math.round(this.store.zoom() * 100));

  protected pick(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    this.openDocument.emit(this.store.documents()[index]);
  }
}
