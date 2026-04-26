import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { SpotifyService } from '../../spotify.service';

export const guestGuard: CanActivateFn = () => {
  const spotifyService = inject(SpotifyService);
  const router = inject(Router);

  return spotifyService.checkAuth().pipe(
    map((response) => (response.isLoggedIn ? router.createUrlTree(['/dashboard']) : true)),
    catchError(() => of(true))
  );
};
