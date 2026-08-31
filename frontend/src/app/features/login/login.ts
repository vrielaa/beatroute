import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { SpotifyService } from '@core/services/spotify.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'login-page-host',
  },
})
class Login {
  readonly spotifyService = inject(SpotifyService);

  public login(): void {
    this.spotifyService.loginWithSpotify();
  }
}

export { Login };
