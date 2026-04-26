import { Component, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly spotifyService = inject(SpotifyService);

  public login(): void {
    this.spotifyService.loginWithSpotify();
  }
}
