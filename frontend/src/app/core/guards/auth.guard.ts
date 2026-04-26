import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SpotifyService } from '../../spotify.service';

export const authGuard: CanActivateFn = () => {
  const spotifyService = inject(SpotifyService);
  const router = inject(Router);

  return spotifyService.checkAuth().pipe(
    map((response) => {
      return response.isLoggedIn ? true : router.createUrlTree(['/login']);
    }),
    catchError(() => of(router.createUrlTree(['/login'])))
  );
};
