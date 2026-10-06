import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import { Box, FielCell, FielPage, FielText, LOW_CONFIDENCE } from './fiel-document.model';

type TextPart = 'label' | 'value';

@Component({
  selector: 'fiel-document',
  imports: [DecimalPipe],
  templateUrl: './fiel-document.component.html',
  styleUrl: './fiel-document.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FielDocumentComponent {
  /** Two-way bound: every edit emits a new document object. */
  readonly document = model.required<FielPage>();

  readonly showOriginal = signal(true);
  readonly hoveredCellId = signal<string | null>(null);
  readonly editedCellIds = signal<ReadonlySet<string>>(new Set());

  readonly cells = computed(() =>
    this.document().sections.flatMap(section => section.rows.flatMap(row => row.cells)),
  );

  readonly lowConfidenceCount = computed(
    () => this.cells().filter(cell => this.isLowConfidence(cell)).length,
  );

  readonly highlights = computed(() =>
    this.cells()
      .filter(cell => cell.box?.length === 4)
      .map(cell => ({ id: cell.id, style: toPercentStyle(cell.box) })),
  );

  isLowConfidence(cell: FielCell): boolean {
    return cell.confidence < LOW_CONFIDENCE;
  }

  isEdited(cell: FielCell): boolean {
    return this.editedCellIds().has(cell.id);
  }

  textOf(event: Event): string {
    return (event.target as HTMLElement).innerText.trim();
  }

  updateDocumentTitle(value: string): void {
    if (this.document().document_title?.translated === value) return;
    this.edit(null, doc => (doc.document_title = withTranslation(doc.document_title, value)));
  }

  updateSectionTitle(si: number, value: string): void {
    if (this.document().sections[si].title?.translated === value) return;
    this.edit(null, doc => {
      const section = doc.sections[si];
      section.title = withTranslation(section.title, value);
    });
  }

  updateCellText(si: number, ri: number, ci: number, part: TextPart, value: string): void {
    const cell = this.cellAt(this.document(), si, ri, ci);
    if ((cell[part]?.translated ?? '') === value) return;

    this.edit(cell.id, doc => {
      const target = this.cellAt(doc, si, ri, ci);
      target[part] = withTranslation(target[part], value);
    });
  }

  toggleCheckbox(si: number, ri: number, ci: number): void {
    const cell = this.cellAt(this.document(), si, ri, ci);
    this.edit(cell.id, doc => {
      const target = this.cellAt(doc, si, ri, ci);
      target.checked = !target.checked;
    });
  }

  private cellAt(doc: FielPage, si: number, ri: number, ci: number): FielCell {
    return doc.sections[si].rows[ri].cells[ci];
  }

  /** Edits a deep copy so the parent always receives a new, immutable document. */
  private edit(cellId: string | null, change: (doc: FielPage) => void): void {
    const copy = structuredClone(this.document());
    change(copy);
    this.document.set(copy);

    if (cellId) {
      this.editedCellIds.update(ids => new Set(ids).add(cellId));
    }
  }
}

function withTranslation(text: FielText | null | undefined, translated: string): FielText {
  return {
    original: text?.original ?? '',
    is_literal: text?.is_literal ?? false,
    translated,
  };
}

function toPercentStyle([ymin, xmin, ymax, xmax]: Box): Record<string, string> {
  return {
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
  };
}
