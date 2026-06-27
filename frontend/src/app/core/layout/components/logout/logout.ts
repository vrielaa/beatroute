import { Component, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-logout',
  imports: [Icon],
  templateUrl: './logout.html',
  styleUrl: './logout.scss',
})
export class Logout {
  readonly spotifyService = inject(SpotifyService);

  public logout(): void {
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
