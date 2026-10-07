import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentStatus, TrackResponse, apiErrorMessage } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents.api';
import { Icon } from '../../shared/icon';
import { SiteHeader } from '../../shared/site-header';

/** Client-facing progress: the order goes through these steps. */
const STEPS: { label: string; statuses: DocumentStatus[] }[] = [
  { label: 'Received', statuses: ['uploaded', 'failed'] },
  { label: 'Preparing', statuses: ['processing', 'ready'] },
  { label: 'In translation', statuses: ['in_review'] },
  { label: 'Certified', statuses: ['approved'] },
];

/** Clients see plain wording, not the internal workflow states. */
const CLIENT_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Received',
  processing: 'Preparing',
  ready: 'Preparing',
  in_review: 'In translation',
  approved: 'Certified',
  failed: 'Under review',
};

@Component({
  selector: 'fidela-track-page',
  imports: [RouterLink, DatePipe, Icon, SiteHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './track-page.html',
  styleUrl: './track-page.scss',
})
export class TrackPage implements OnInit {
  private readonly api = inject(DocumentsApi);
  protected readonly auth = inject(AuthService);

  /** Pre-filled from the upload confirmation link. */
  readonly reference = input<string>();
  readonly email = input<string>();

  protected readonly steps = STEPS;
  protected readonly labels = CLIENT_LABELS;

  protected readonly referenceValue = signal('');
  protected readonly emailValue = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly order = signal<TrackResponse | null>(null);
  protected readonly myOrders = signal<TrackResponse[] | null>(null);

  ngOnInit(): void {
    this.referenceValue.set(this.reference() ?? '');
    this.emailValue.set(this.email() ?? '');
    if (this.reference() && this.email()) this.lookup();
    if (this.auth.hasRole('client')) {
      this.api.myDocuments().then(orders => this.myOrders.set(orders)).catch(() => this.myOrders.set([]));
    }
  }

  protected async lookup(event?: Event): Promise<void> {
    event?.preventDefault();
    const reference = this.referenceValue().trim().toUpperCase();
    const email = this.emailValue().trim();
    if (!reference || !email) {
      this.error.set('Enter your order reference and the email you used.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      this.order.set(await this.api.track(reference, email));
    } catch (error) {
      this.order.set(null);
      this.error.set(apiErrorMessage(error, 'We could not find that order.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected stepIndex(status: DocumentStatus): number {
    return STEPS.findIndex(step => step.statuses.includes(status));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
