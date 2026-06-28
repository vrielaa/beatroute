import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SpotifyService } from '@core/services/spotify.service';
import { map, catchError, of } from 'rxjs';

export const guestGuard: CanActivateFn = () => {
  const spotifyService = inject(SpotifyService);
  const router = inject(Router);

  return spotifyService.checkAuth().pipe(
    map((response) => (response.isLoggedIn ? router.createUrlTree(['/dashboard']) : true)),
    catchError(() => of(true))
  );
};
