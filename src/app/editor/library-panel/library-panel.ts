import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ASSET_DRAG_TYPE, DRAG_TYPE, LibraryDragItem, TEXT_PRESETS, TextPreset } from '../editor.models';
import { EditorStore } from '../editor.store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'fiel-library-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library-panel.html',
  styleUrl: './library-panel.scss',
})
export class LibraryPanel {
  protected readonly store = inject(EditorStore);
  protected readonly presets = Object.entries(TEXT_PRESETS).map(([id, preset]) => ({
    id: id as TextPreset,
    ...preset,
  }));

  protected startDrag(event: DragEvent, item: LibraryDragItem): void {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    transfer.setData(DRAG_TYPE, JSON.stringify(item));
    if (item.kind === 'asset') transfer.setData(ASSET_DRAG_TYPE, '');
    transfer.effectAllowed = 'copy';
  }

  protected setBackgroundOpacity(event: Event): void {
    const opacity = Number((event.target as HTMLInputElement).value);
    this.store.pageBackground.update(bg => (bg ? { ...bg, opacity } : bg));
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.store.addAssetFiles(input.files);
    }
    input.value = '';
  }
}
