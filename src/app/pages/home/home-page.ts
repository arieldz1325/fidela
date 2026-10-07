import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { UploadResponse, apiErrorMessage } from '../../core/api.models';
import { DocumentsApi } from '../../core/documents.api';
import { Icon } from '../../shared/icon';
import { SiteHeader } from '../../shared/site-header';

const MAX_FILES = 10;
const MAX_FILE_MB = 20;
const ACCEPTED = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff'];
const PREVIEWABLE = ['.jpg', '.jpeg', '.png', '.webp'];

interface SelectedFile {
  id: string;
  file: File;
  kind: 'pdf' | 'image';
  previewUrl: string | null;
}

@Component({
  selector: 'fidela-home-page',
  imports: [RouterLink, Icon, SiteHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly api = inject(DocumentsApi);

  protected readonly accept = ACCEPTED.join(',');
  protected readonly maxFiles = MAX_FILES;
  protected readonly maxFileMb = MAX_FILE_MB;
  protected readonly sourceLanguages = [
    'Auto-detect', 'Spanish', 'French', 'Portuguese', 'Arabic', 'Chinese', 'Hindi', 'Punjabi',
    'Tagalog', 'Farsi', 'Ukrainian', 'Russian', 'Other',
  ];
  protected readonly targetLanguages = ['English', 'French'];

  protected readonly files = signal<SelectedFile[]>([]);
  protected readonly rejected = signal<string[]>([]);
  protected readonly dragging = signal(false);

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly sourceLanguage = signal('Auto-detect');
  protected readonly targetLanguage = signal('English');
  protected readonly notes = signal('');
  protected readonly consent = signal(false);
  protected readonly submitted = signal(false);

  protected readonly uploading = signal(false);
  protected readonly progress = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<UploadResponse | null>(null);
  protected readonly copied = signal(false);

  protected readonly totalSize = computed(() => this.files().reduce((sum, f) => sum + f.file.size, 0));
  protected readonly emailValid = computed(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email().trim()));
  protected readonly nameValid = computed(() => this.name().trim().length >= 2);
  protected readonly canSubmit = computed(
    () => this.files().length > 0 && this.nameValid() && this.emailValid() && this.consent() && !this.uploading(),
  );

  private dragDepth = 0;
  private upload?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.upload?.unsubscribe();
      this.files().forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    });
  }

  // ---------- Choosing files ----------

  protected onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  protected onDragLeave(): void {
    // dragleave fires for every child element; only the outermost one counts.
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    if (event.dataTransfer?.files.length) this.addFiles(event.dataTransfer.files);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.addFiles(input.files);
    input.value = '';
  }

  private addFiles(list: FileList): void {
    const rejected: string[] = [];
    const added: SelectedFile[] = [];

    for (const file of Array.from(list)) {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!ACCEPTED.includes(extension)) {
        rejected.push(`${file.name}: use PDF, JPG, PNG, WebP, HEIC or TIFF`);
      } else if (file.size > MAX_FILE_MB * 1024 * 1024) {
        rejected.push(`${file.name}: larger than ${MAX_FILE_MB} MB`);
      } else if (this.files().length + added.length >= MAX_FILES) {
        rejected.push(`${file.name}: up to ${MAX_FILES} files per order`);
      } else {
        added.push({
          id: crypto.randomUUID(),
          file,
          kind: extension === '.pdf' ? 'pdf' : 'image',
          previewUrl: PREVIEWABLE.includes(extension) ? URL.createObjectURL(file) : null,
        });
      }
    }

    this.files.update(current => [...current, ...added]);
    this.rejected.set(rejected);
    this.error.set(null);
  }

  protected remove(id: string): void {
    const item = this.files().find(f => f.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this.files.update(current => current.filter(f => f.id !== id));
  }

  // ---------- Sending ----------

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    if (!this.canSubmit()) return;

    this.uploading.set(true);
    this.progress.set(0);
    this.error.set(null);

    this.upload = this.api.upload({
      files: this.files().map(f => f.file),
      clientName: this.name().trim(),
      clientEmail: this.email().trim(),
      sourceLanguage: this.sourceLanguage(),
      targetLanguage: this.targetLanguage(),
      notes: this.notes().trim(),
    }).subscribe({
      next: httpEvent => {
        if (httpEvent.type === HttpEventType.UploadProgress && httpEvent.total) {
          this.progress.set(Math.round((httpEvent.loaded / httpEvent.total) * 100));
        } else if (httpEvent.type === HttpEventType.Response && httpEvent.body) {
          this.result.set(httpEvent.body);
          this.uploading.set(false);
        }
      },
      error: error => {
        this.error.set(apiErrorMessage(error, 'We could not receive your files. Please try again.'));
        this.uploading.set(false);
      },
    });
  }

  protected async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Clipboard blocked: the reference is still visible to copy by hand.
    }
  }

  protected startOver(): void {
    this.files().forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    this.files.set([]);
    this.rejected.set([]);
    this.notes.set('');
    this.consent.set(false);
    this.submitted.set(false);
    this.result.set(null);
    this.progress.set(0);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
