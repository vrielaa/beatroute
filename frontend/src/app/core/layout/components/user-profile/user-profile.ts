import { Component, computed, inject } from '@angular/core';
import { SpotifyService } from '@core/services/spotify.service';

@Component({
  selector: 'app-user-profile',
  imports: [],
  templateUrl: './user-profile.html',
  host: {
    class:
      'grid min-w-[0] grid-cols-[minmax(0,auto)_5rem] grid-rows-[auto_auto] items-center gap-x-[2rem] gap-y-[0.1rem] pr-[2rem] text-[var(--color-text-primary)] max-[1050px]:grid-cols-[4.4rem] max-[1050px]:pr-0',
  },
})
export class UserProfile {
  readonly spotifyService = inject(SpotifyService);

  readonly profileImageUrl = computed(() => {
    if (!this.spotifyService.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyService.userProfileResource.value()?.images?.[0]?.url ?? null;
  });

  readonly userName = computed(() => {
    if (!this.spotifyService.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyService.userProfileResource.value()?.display_name ?? null;
  });

  readonly userEmail = computed(() => {
    if (!this.spotifyService.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyService.userProfileResource.value()?.email ?? null;
  });
}
