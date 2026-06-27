import { Component, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-logout',
  imports: [Icon],
  templateUrl: './logout.html',
  host: {
    class:
      'grid h-[3.5rem] place-self-center grid-cols-[1.5rem_auto] items-center gap-[0.5rem] rounded-[1rem] px-[1rem] py-[0.5rem] text-[length:var(--text-base)] transition-all duration-300 ease-[ease] hover:scale-105 hover:bg-[var(--color-surface-tertiary)] active:translate-y-[0.2rem] active:bg-[var(--color-surface-tertiary)] max-[600px]:relative max-[600px]:w-[3.6rem] max-[600px]:grid-cols-1 max-[600px]:p-[0.6rem]',
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
