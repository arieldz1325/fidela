import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'fidela-forgot-password-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout single">
      <main class="form-panel">
        <a routerLink="/login" class="back"><fidela-icon name="arrowLeft" [size]="15" /> Back to sign in</a>

        @if (sent()) {
          <div class="form">
            <span class="badge-icon"><fidela-icon name="mail" [size]="22" /></span>
            <h1>Check your email</h1>
            <p class="subtitle">
              If an account exists for <strong>{{ email() }}</strong>, you’ll receive a link to choose a new password.
              It expires in 60 minutes.
            </p>
            <a class="submit as-link" routerLink="/login">Back to sign in</a>
          </div>
        } @else {
          <form class="form" (submit)="submit($event)" novalidate>
            <h1>Forgot your password?</h1>
            <p class="subtitle">Enter the email you use to sign in and we’ll send you a reset link.</p>
            <label class="field">
              <span>Email</span>
              <input type="email" autocomplete="email" [value]="email()" (input)="email.set(value($event))" autofocus />
            </label>
            @if (error(); as message) {
              <p class="error"><fidela-icon name="alert" [size]="14" /> {{ message }}</p>
            }
            <button type="submit" class="submit" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send reset link' }}</button>
          </form>
        }
      </main>
    </div>
  `,
  styleUrl: '../login/login-page.scss',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.forgotPassword(this.email().trim());
      this.sent.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
