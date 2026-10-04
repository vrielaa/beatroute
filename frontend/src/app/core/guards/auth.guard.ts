import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApiService } from '@core/api/auth/auth-api.service';
import { catchError, map, of } from 'rxjs';

const authGuard: CanActivateFn = () => {
  const authApi = inject(AuthApiService);
  const router = inject(Router);

  return authApi.checkAuth().pipe(
    map((response) => {
      return response.isLoggedIn ? true : router.createUrlTree(['/login']);
    }),
    catchError(() => of(router.createUrlTree(['/login'])))
  );
};

export { authGuard };
