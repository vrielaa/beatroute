import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApiService } from '@core/api/auth/auth-api.service';
import { map, catchError, of } from 'rxjs';

const guestGuard: CanActivateFn = () => {
  const authApi = inject(AuthApiService);
  const router = inject(Router);

  return authApi.checkAuth().pipe(
    map((response) => (response.isLoggedIn ? router.createUrlTree(['/dashboard']) : true)),
    catchError(() => of(true))
  );
};

export { guestGuard };
