import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SpotifyService } from '@core/services/spotify.service';
import { catchError, map, of } from 'rxjs';

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
