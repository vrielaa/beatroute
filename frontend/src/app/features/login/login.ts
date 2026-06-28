import { Component, inject } from '@angular/core';
import { SpotifyService } from '@core/services/spotify.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  host: {
    class:
      'block min-h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-primary)]',
  },
})
export class Login {
  readonly spotifyService = inject(SpotifyService);

  public login(): void {
    this.spotifyService.loginWithSpotify();
  }
}
