import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { FieldRef, fieldPreview, fieldTitle } from '../editor.models';
import { EditorStore } from '../editor.store';
import { Icon } from '../ui/icon';

type Filter = 'all' | 'attention' | 'pending';

interface Group {
  pageNumber: number;
  /** First group of its page: the list shows a page heading above it. */
  startsPage: boolean;
  section: string;
  fields: FieldRef[];
}

@Component({
  selector: 'fiel-fields-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fields-list.html',
  styleUrl: './fields-list.scss',
})
export class FieldsList {
  protected readonly store = inject(EditorStore);
  protected readonly filter = signal<Filter>('all');
  protected readonly title = fieldTitle;
  protected readonly preview = fieldPreview;

  protected readonly pendingCount = computed(() => this.store.fields().length - this.store.verifiedCount());

  protected readonly groups = computed<Group[]>(() => {
    const filter = this.filter();
    const verified = this.store.verified();
    const groups: Group[] = [];

    for (const field of this.store.fields()) {
      const isVerified = verified.has(field.key);
      if (filter === 'pending' && isVerified) continue;
      if (filter === 'attention' && (isVerified || !field.issues.length)) continue;

      const last = groups.at(-1);
      if (last && last.section === field.section && last.pageNumber === field.pageNumber) {
        last.fields.push(field);
      } else {
        groups.push({
          pageNumber: field.pageNumber,
          startsPage: last?.pageNumber !== field.pageNumber,
          section: field.section,
          fields: [field],
        });
      }
    }
    return groups;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      if (this.store.selectedKey()) {
        host.querySelector('.item.selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
}
