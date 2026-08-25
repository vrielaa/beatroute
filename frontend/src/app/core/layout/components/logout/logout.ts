import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { SpotifyService } from '@core/services/spotify.service';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-logout',
  imports: [Icon],
  templateUrl: './logout.html',
  styleUrl: './logout.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'logout-action',
  },
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
