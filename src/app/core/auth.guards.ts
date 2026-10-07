import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from './api.models';
import { AuthService } from './auth.service';

/** Only signed-in users with one of these profiles; everyone else goes to the login page. */
export function requireRole(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.user()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    return auth.hasRole(...roles) ? true : router.parseUrl(auth.homeFor());
  };
}

/** The login page is pointless once signed in. */
export const redirectSignedIn: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).parseUrl(auth.homeFor()) : true;
};
