import { Component, computed, inject } from '@angular/core';
import { SpotifyService } from '@src/app/spotify.service';

@Component({
  selector: 'app-user-profile',
  imports: [],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
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
