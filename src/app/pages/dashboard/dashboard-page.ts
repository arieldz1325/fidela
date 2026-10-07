import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DocumentStatus, DocumentSummary, Role, STATUS_LABELS, User, apiErrorMessage } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents.api';
import { Icon, IconName } from '../../shared/icon';

type Filter = 'todo' | 'in_review' | 'approved' | 'attention' | 'all';
type Tab = 'documents' | 'team';

const FILTERS: { id: Filter; label: string; statuses: DocumentStatus[] | null }[] = [
  { id: 'todo', label: 'To do', statuses: ['ready', 'uploaded', 'processing'] },
  { id: 'in_review', label: 'In review', statuses: ['in_review'] },
  { id: 'approved', label: 'Approved', statuses: ['approved'] },
  { id: 'attention', label: 'Needs attention', statuses: ['failed'] },
  { id: 'all', label: 'All', statuses: null },
];

const POLL_MS = 5000;

@Component({
  selector: 'fidela-dashboard-page',
  imports: [RouterLink, DatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly api = inject(DocumentsApi);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly labels = STATUS_LABELS;

  protected readonly tab = signal<Tab>('documents');
  protected readonly filter = signal<Filter>('todo');
  protected readonly search = signal('');
  protected readonly documents = signal<DocumentSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly isManager = computed(() => this.auth.hasRole('manager'));
  protected readonly firstName = computed(() => this.auth.user()?.full_name.split(' ')[0] ?? '');

  protected readonly counts = computed(() => {
    const docs = this.documents();
    return Object.fromEntries(
      FILTERS.map(f => [f.id, f.statuses ? docs.filter(d => f.statuses!.includes(d.status)).length : docs.length]),
    ) as Record<Filter, number>;
  });

  protected readonly kpis = computed<{ label: string; value: number; icon: IconName; tone: string }[]>(() => {
    const docs = this.documents();
    const count = (...statuses: DocumentStatus[]) => docs.filter(d => statuses.includes(d.status)).length;
    return [
      { label: 'Ready to translate', value: count('ready'), icon: 'inbox', tone: 'accent' },
      { label: 'In review', value: count('in_review'), icon: 'note', tone: 'blue' },
      { label: 'Approved', value: count('approved'), icon: 'shield', tone: 'ok' },
      { label: 'Processing', value: count('uploaded', 'processing'), icon: 'clock', tone: 'muted' },
    ];
  });

  protected readonly visible = computed(() => {
    const statuses = FILTERS.find(f => f.id === this.filter())?.statuses;
    const query = this.search().trim().toLowerCase();
    return this.documents().filter(d =>
      (!statuses || statuses.includes(d.status)) &&
      (!query || [d.reference, d.client_name, d.client_email].some(v => v.toLowerCase().includes(query))),
    );
  });

  // ---------- Team (managers) ----------
  protected readonly users = signal<User[]>([]);
  protected readonly newUser = signal({ full_name: '', email: '', role: 'translator' as Role });
  protected readonly teamError = signal<string | null>(null);
  protected readonly teamNotice = signal<string | null>(null);

  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
  }

  protected async load(): Promise<void> {
    clearTimeout(this.pollTimer);
    try {
      this.documents.set(await this.api.list());
      this.error.set(null);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not load documents.'));
    } finally {
      this.loading.set(false);
    }
    // Keep refreshing while the AI is still preparing drafts.
    if (this.documents().some(d => d.status === 'uploaded' || d.status === 'processing')) {
      this.pollTimer = setTimeout(() => this.load(), POLL_MS);
    }
  }

  protected open(doc: DocumentSummary): void {
    this.router.navigate(['/editor', doc.id]);
  }

  protected async claim(doc: DocumentSummary): Promise<void> {
    await this.run(doc, () => this.api.claim(doc.id));
  }

  protected async retry(doc: DocumentSummary): Promise<void> {
    await this.run(doc, () => this.api.retry(doc.id));
  }

  private async run(doc: DocumentSummary, action: () => Promise<DocumentSummary>): Promise<void> {
    this.busyId.set(doc.id);
    try {
      const updated = await action();
      this.documents.update(list => list.map(d => (d.id === updated.id ? updated : d)));
      if (updated.status === 'uploaded' || updated.status === 'processing') this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  // ---------- Ask the client for a clearer copy ----------

  protected readonly clearerFor = signal<DocumentSummary | null>(null);
  protected readonly clearerMessage = signal('');
  protected readonly clearerBusy = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected openClearer(doc: DocumentSummary): void {
    this.clearerMessage.set('');
    this.clearerFor.set(doc);
  }

  protected async sendClearer(event: Event): Promise<void> {
    event.preventDefault();
    const doc = this.clearerFor();
    if (!doc) return;
    this.clearerBusy.set(true);
    try {
      const result = await this.api.requestClearerCopy(doc.id, this.clearerMessage().trim());
      this.notice.set(result.detail);
      this.clearerFor.set(null);
      setTimeout(() => this.notice.set(null), 4000);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not send the email.'));
    } finally {
      this.clearerBusy.set(false);
    }
  }

  protected canOpen(doc: DocumentSummary): boolean {
    return doc.status === 'ready' || doc.status === 'in_review' || doc.status === 'approved';
  }

  protected isMine(doc: DocumentSummary): boolean {
    return doc.assigned_to === this.auth.user()?.id;
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('');
  }

  protected timeAgo(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  // ---------- Team ----------

  protected async showTeam(): Promise<void> {
    this.tab.set('team');
    try {
      this.users.set(await this.api.users());
    } catch (error) {
      this.teamError.set(apiErrorMessage(error, 'Could not load the team.'));
    }
  }

  protected updateNewUser(field: 'full_name' | 'email' | 'role', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.newUser.update(user => ({ ...user, [field]: value }));
  }

  protected async createUser(event: Event): Promise<void> {
    event.preventDefault();
    this.teamError.set(null);
    this.teamNotice.set(null);
    try {
      const user = await this.api.createUser(this.newUser());
      this.users.update(list => [...list, user]);
      this.teamNotice.set(`Invitation sent to ${user.email}. They’ll choose their own password.`);
      this.newUser.set({ full_name: '', email: '', role: 'translator' });
    } catch (error) {
      this.teamError.set(apiErrorMessage(error, 'Could not create the user.'));
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
