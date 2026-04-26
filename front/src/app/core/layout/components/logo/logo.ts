import { Component, computed, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';

@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
})
export class Logo {
  readonly spotifyService = inject(SpotifyService);

  readonly logoUrl = 'logo.png';
  public isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark-mode');
  }
}
