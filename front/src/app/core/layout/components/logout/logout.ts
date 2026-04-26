import { Component, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';

@Component({
  selector: 'app-logout',
  imports: [],
  templateUrl: './logout.html',
  styleUrl: './logout.scss',
})
export class Logout {
  readonly spotifyService = inject(SpotifyService);

  public logout(): void {
    console.log('Logging out...');
    this.spotifyService.logout().subscribe({
      next: () => {
        window.location.href = '/login';
      },
      error: (err) => {
        console.error('Logout failed', err);
      },
    });
  }
}
