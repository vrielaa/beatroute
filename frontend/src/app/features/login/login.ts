import { Component, inject } from '@angular/core';
import { SpotifyService } from '@core/services/spotify.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  host: {
    class:
      'grid min-h-screen place-items-center bg-[var(--color-bg)] p-[2rem] text-[var(--color-text-primary)]',
  },
})
export class Login {
  readonly spotifyService = inject(SpotifyService);

  public login(): void {
    this.spotifyService.loginWithSpotify();
  }
}
