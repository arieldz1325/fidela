import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon } from './icon';

@Component({
  selector: 'fidela-site-header',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inner">
      <a routerLink="/" class="brand" aria-label="Fidela home">
        <span class="mark">F</span>
        <span class="name">Fidela <span class="name-light">Translations</span></span>
      </a>

      <nav>
        <a routerLink="/" fragment="how">How it works</a>
        <a routerLink="/" fragment="documents">Documents</a>
        <a routerLink="/track">Track an order</a>
      </nav>

      <div class="actions">
        @if (auth.user(); as user) {
          <a class="button primary" [routerLink]="auth.homeFor()">
            {{ user.role === 'client' ? 'My orders' : 'Dashboard' }}
            <fidela-icon name="arrowRight" [size]="15" />
          </a>
          <button type="button" class="button ghost" (click)="auth.logout()">Sign out</button>
        } @else {
          <a class="button ghost" routerLink="/login"><fidela-icon name="user" [size]="15" /> Sign in</a>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 20;
      display: block;
      border-bottom: 1px solid rgb(230 230 234 / 0.8);
      background: rgb(255 255 255 / 0.85);
      backdrop-filter: saturate(180%) blur(12px);
    }

    .inner {
      display: flex;
      align-items: center;
      gap: 32px;
      max-width: 1180px;
      height: 64px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 9px;
      background: linear-gradient(135deg, var(--accent), #7c3aed);
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      box-shadow: 0 4px 12px rgb(79 70 229 / 0.3);
    }

    .name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .name-light {
      color: var(--text-muted);
      font-weight: 500;
    }

    nav {
      display: flex;
      gap: 24px;
      flex: 1;

      a {
        color: var(--text-muted);
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;

        &:hover {
          color: var(--text);
        }
      }
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 38px;
      padding: 0 16px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }

    .ghost {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);

      &:hover {
        background: var(--panel-muted);
      }
    }

    .primary {
      border: 0;
      background: var(--text);
      color: #fff;

      &:hover {
        background: #000;
      }
    }

    @media (max-width: 760px) {
      nav {
        display: none;
      }

      .inner {
        justify-content: space-between;
        padding: 0 16px;
      }
    }
  `,
})
export class SiteHeader {
  protected readonly auth = inject(AuthService);
}
