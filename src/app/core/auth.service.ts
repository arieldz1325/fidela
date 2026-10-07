import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL, Role, TokenResponse, User } from './api.models';

const STORAGE_KEY = 'fidela.session';

interface Session {
  token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isStaff = computed(() => this.hasRole('translator', 'manager'));

  constructor() {
    // Make sure a stored session is still valid (expired token, deleted user...).
    // Deferred: the interceptor injects this service, so no request can start while it is being created.
    if (this.session()) queueMicrotask(() => this.refreshUser());
  }

  private refreshUser(): void {
    this.http.get<User>(`${API_URL}/auth/me`).subscribe({
      next: user => this.store({ token: this.token()!, user }),
      error: () => this.clear(),
    });
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(`${API_URL}/auth/login`, { email, password }),
    );
    this.store({ token: response.access_token, user: response.user });
    return response.user;
  }

  /** Always resolves the same way, whether or not the email has an account. */
  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API_URL}/auth/forgot-password`, { email }));
  }

  /** Sets a password from an invitation or reset link and signs the person in. */
  async resetPassword(token: string, password: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(`${API_URL}/auth/reset-password`, { token, password }),
    );
    this.store({ token: response.access_token, user: response.user });
    return response.user;
  }

  logout(): void {
    this.clear();
    this.router.navigateByUrl('/');
  }

  /** Called by the interceptor when the API rejects the token. */
  sessionExpired(): void {
    if (!this.session()) return;
    this.clear();
    this.router.navigate(['/login'], { queryParams: { expired: 1 } });
  }

  hasRole(...roles: Role[]): boolean {
    const user = this.user();
    return !!user && roles.includes(user.role);
  }

  /** Where each profile lands after signing in. */
  homeFor(user: User | null = this.user()): string {
    if (!user) return '/';
    return user.role === 'client' ? '/track' : '/dashboard';
  }

  private store(session: Session): void {
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode or blocked storage: the session simply won't survive a reload.
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: nothing persisted.
    }
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
