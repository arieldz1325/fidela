import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_URL } from './api.models';
import { AuthService } from './auth.service';

/** Adds the bearer token to API calls and signs out when the API says the token is no longer valid. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const isApi = request.url.startsWith(API_URL);
  // Public auth endpoints: a 401 there is an answer for the form, not an expired session.
  const isLogin = [`${API_URL}/auth/login`, `${API_URL}/auth/reset-password`, `${API_URL}/auth/forgot-password`].includes(request.url);

  const outgoing = isApi && token && !isLogin
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (isApi && !isLogin && error instanceof HttpErrorResponse && error.status === 401) {
        auth.sessionExpired();
      }
      return throwError(() => error);
    }),
  );
};
