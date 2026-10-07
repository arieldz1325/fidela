import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

const MIN_LENGTH = 10;

/** Used by both the invitation link (welcome=1) and the "forgot password" link. */
@Component({
  selector: 'fidela-reset-password-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout single">
      <main class="form-panel">
        <a routerLink="/" class="back"><fidela-icon name="arrowLeft" [size]="15" /> Back to site</a>

        @if (!token()) {
          <div class="form">
            <h1>This link is incomplete</h1>
            <p class="subtitle">Open the link from your email again, or request a new one.</p>
            <a class="submit as-link" routerLink="/forgot-password">Request a new link</a>
          </div>
        } @else {
          <form class="form" (submit)="submit($event)" novalidate>
            <h1>{{ welcome() ? 'Welcome to Fidela' : 'Choose a new password' }}</h1>
            <p class="subtitle">
              {{ welcome() ? 'Set the password you’ll use to sign in.' : 'You’ll be signed in right after.' }}
            </p>

            <label class="field">
              <span>New password</span>
              <div class="password">
                <input
                  [type]="show() ? 'text' : 'password'"
                  autocomplete="new-password"
                  [value]="password()"
                  (input)="password.set(value($event))"
                  autofocus
                />
                <button type="button" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Hide password' : 'Show password'">
                  <fidela-icon name="eye" [size]="16" />
                </button>
              </div>
            </label>
            <label class="field">
              <span>Confirm password</span>
              <input [type]="show() ? 'text' : 'password'" autocomplete="new-password" [value]="confirm()" (input)="confirm.set(value($event))" />
            </label>

            <ul class="rules">
              <li [class.ok]="longEnough()"><fidela-icon [name]="longEnough() ? 'check' : 'minus'" [size]="13" /> At least {{ minLength }} characters</li>
              <li [class.ok]="matches()"><fidela-icon [name]="matches() ? 'check' : 'minus'" [size]="13" /> Both passwords match</li>
            </ul>

            @if (error(); as message) {
              <p class="error"><fidela-icon name="alert" [size]="14" /> {{ message }}</p>
            }
            <button type="submit" class="submit" [disabled]="busy() || !longEnough() || !matches()">
              {{ busy() ? 'Saving…' : welcome() ? 'Set password and sign in' : 'Save and sign in' }}
            </button>
            @if (error()) {
              <p class="alt"><a routerLink="/forgot-password">Request a new link</a></p>
            }
          </form>
        }
      </main>
    </div>
  `,
  styleUrl: '../login/login-page.scss',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params, bound by the router. */
  readonly token = input<string>();
  readonly welcomeParam = input<string>(undefined, { alias: 'welcome' });

  protected readonly minLength = MIN_LENGTH;
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly welcome = computed(() => this.welcomeParam() === '1');
  protected readonly longEnough = computed(() => this.password().length >= MIN_LENGTH);
  protected readonly matches = computed(() => !!this.password() && this.password() === this.confirm());

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const token = this.token();
    if (!token || !this.longEnough() || !this.matches()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.resetPassword(token, this.password());
      await this.router.navigateByUrl(this.auth.homeFor(user));
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'We could not update your password.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
