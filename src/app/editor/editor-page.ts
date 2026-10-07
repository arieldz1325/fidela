import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { apiErrorMessage } from '../core/api.models';
import { DocumentsApi } from '../core/documents.api';
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
import { Icon } from '../shared/icon';

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
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:beforeunload)': 'warnUnsaved($event)',
  },
})
export class EditorPage implements OnInit {
  /** Route parameter: a document from the API. Without it the editor opens the local demo documents. */
  readonly id = input<string>();

  protected readonly store = inject(EditorStore);
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);
  protected readonly saving = signal(false);
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

  ngOnInit(): void {
    const id = this.id();
    if (id) this.loadRemote(id);
    else this.loadIndex();
  }

  constructor() {
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

  private async loadRemote(id: string): Promise<void> {
    try {
      const draft = await this.api.draft(id);
      const entry: FielDocumentEntry = { name: draft.reference, path: id, pages: draft.document.pages.length };
      this.store.load(entry, draft.document, id);
      if (draft.review) this.store.restoreReview(draft.review, draft.status === 'approved');
      else if (draft.status === 'approved') this.store.approved.set(true);
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(apiErrorMessage(error, 'Could not open this document.'));
    }
  }

  // ---------- Saving & approval (API documents) ----------

  protected async save(): Promise<void> {
    const id = this.store.remoteId();
    const payload = this.store.reviewPayload();
    if (!id || !payload || this.saving() || this.store.approved()) return;

    this.saving.set(true);
    try {
      const version = await this.api.saveReview(id, payload);
      this.store.markSaved();
      this.store.notify(`Saved · version ${version.version}`);
    } catch (error) {
      this.store.notify(apiErrorMessage(error, 'Could not save. Your changes are still here.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async approve(): Promise<void> {
    const id = this.store.remoteId();
    if (!id) {
      this.store.approve();
      return;
    }
    const payload = this.store.reviewPayload();
    if (!payload || !this.store.allVerified()) {
      this.store.approve(); // shows "verify every field" message
      return;
    }
    this.saving.set(true);
    try {
      await this.api.approve(id, payload);
      this.store.approve();
      this.store.markSaved();
    } catch (error) {
      this.store.notify(apiErrorMessage(error, 'Could not approve the document.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async reopen(): Promise<void> {
    const id = this.store.remoteId();
    try {
      if (id) await this.api.reopen(id);
      this.store.reopen();
    } catch (error) {
      this.store.notify(apiErrorMessage(error, 'Could not reopen the document.'));
    }
  }

  protected backToDashboard(): void {
    if (this.store.dirty() && !confirm('You have unsaved changes. Leave without saving?')) return;
    this.router.navigateByUrl('/dashboard');
  }

  protected warnUnsaved(event: BeforeUnloadEvent): void {
    if (this.store.remoteId() && this.store.dirty()) event.preventDefault();
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
    if (mod && event.key.toLowerCase() === 's') return this.handled(event, () => this.save());

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
