import { ChangeDetectionStrategy, Component, inject, input, isDevMode, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'fidela-login-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params, bound by the router. */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Demo accounts are created by the API on an empty database; only shown in development builds. */
  protected readonly demoAccounts = isDevMode()
    ? [
        { role: 'Translator', email: 'translator@fidela.local', password: 'Translator-2026!' },
        { role: 'Manager', email: 'manager@fidela.local', password: 'Manager-2026!' },
        { role: 'Client', email: 'client@fidela.local', password: 'Client-2026!' },
      ]
    : [];

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.email().trim() || !this.password()) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.login(this.email().trim(), this.password());
      const returnUrl = this.returnUrl();
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : this.auth.homeFor(user));
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'We could not sign you in. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected useDemo(account: { email: string; password: string }): void {
    this.email.set(account.email);
    this.password.set(account.password);
    this.error.set(null);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
