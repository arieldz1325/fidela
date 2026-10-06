import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { loadDocumentIndex, loadFielDocument } from '../fiel-document/fiel-document.loader';
import { FielDocumentEntry } from '../fiel-document/fiel-document.model';
import { DOCUMENT_INDEX } from './editor.models';
import { EditorStore } from './editor.store';
import { FieldsList } from './fields-list/fields-list';
import { Inspector } from './inspector/inspector';
import { LibraryPanel } from './library-panel/library-panel';
import { PageCanvas } from './page-canvas/page-canvas';
import { SourceView } from './source-view/source-view';
import { TopBar } from './top-bar/top-bar';
import { Icon } from './ui/icon';

type LeftTab = 'fields' | 'library';

const LEFT_WIDTH = 272;
const RIGHT_WIDTH = 320;
const MIN_SOURCE_WIDTH = 240;
const MIN_CANVAS_WIDTH = 320;

@Component({
  selector: 'app-editor-page',
  imports: [TopBar, FieldsList, LibraryPanel, SourceView, PageCanvas, Inspector, Icon],
  providers: [EditorStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class EditorPage {
  protected readonly store = inject(EditorStore);
  protected readonly leftTab = signal<LeftTab>('fields');
  protected readonly showSource = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** Width of the original viewer in px; null means the default proportion. */
  protected readonly sourceWidth = signal<number | null>(null);
  protected readonly resizing = signal(false);
  private resizeStart: { x: number; width: number; max: number } | null = null;
  private readonly center = viewChild.required<ElementRef<HTMLElement>>('center');

  protected readonly bodyColumns = computed(
    () => `${this.store.leftPanelOpen() ? LEFT_WIDTH : 0}px minmax(0, 1fr) ${this.store.rightPanelOpen() ? RIGHT_WIDTH : 0}px`,
  );
  protected readonly centerColumns = computed(() => {
    if (!this.showSource()) return 'minmax(0, 1fr)';
    const width = this.sourceWidth();
    return `${width ? `${width}px` : 'minmax(300px, 38%)'} 6px minmax(0, 1fr)`;
  });

  constructor() {
    this.loadIndex();

    // Cropping happens in the original viewer, so make sure it is visible.
    effect(() => {
      if (this.store.cropRequest()) this.showSource.set(true);
    });
  }

  private async loadIndex(): Promise<void> {
    try {
      const documents = await loadDocumentIndex(DOCUMENT_INDEX);
      this.store.documents.set(documents);
      if (documents.length) await this.open(documents[0]);
      else this.loadError.set('No documents yet. Run gem_json.py on a PDF or image first.');
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async open(entry: FielDocumentEntry): Promise<void> {
    try {
      this.store.load(entry, await loadFielDocument(entry.path));
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected startResize(event: PointerEvent): void {
    const splitter = event.target as HTMLElement;
    const sourceWidth = splitter.previousElementSibling!.getBoundingClientRect().width;
    const centerWidth = this.center().nativeElement.clientWidth;
    splitter.setPointerCapture(event.pointerId);
    this.resizeStart = { x: event.clientX, width: sourceWidth, max: centerWidth - MIN_CANVAS_WIDTH };
    this.resizing.set(true);
  }

  protected resize(event: PointerEvent): void {
    const start = this.resizeStart;
    if (!start) return;
    const width = start.width + event.clientX - start.x;
    this.sourceWidth.set(Math.round(Math.min(start.max, Math.max(MIN_SOURCE_WIDTH, width))));
  }

  protected endResize(): void {
    this.resizeStart = null;
    this.resizing.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key === '\\') return this.handled(event, () => this.store.togglePanels());

    if (mod && (event.key === '=' || event.key === '+')) return this.handled(event, () => this.store.zoomBy(0.1));
    if (mod && event.key === '-') return this.handled(event, () => this.store.zoomBy(-0.1));
    if (mod && event.key === '0') return this.handled(event, () => this.store.zoomToFit());

    // Inside regular inputs keys behave normally; the translation box keeps the review shortcuts.
    const typing = target.matches('input, select, textarea:not(.translation-input), [contenteditable]');
    if (typing) return;

    switch (event.key) {
      case 'Tab':
        return this.handled(event, () => this.store.moveSelection(event.shiftKey ? -1 : 1));
      case 'Enter':
        if (!event.shiftKey) this.handled(event, () => this.store.verifyAndNext());
        return;
      case 'Escape':
        if (this.store.cropRequest()) {
          this.store.cancelCrop();
          return;
        }
        this.store.clearSelection();
        target.blur();
        return;
      case 'Delete':
      case 'Backspace': {
        const overlay = this.store.selectedOverlay();
        if (overlay && target.tagName !== 'TEXTAREA') this.handled(event, () => this.store.removeOverlay(overlay.id));
        return;
      }
    }
  }

  private handled(event: KeyboardEvent, action: () => void): void {
    event.preventDefault();
    action();
  }
}
