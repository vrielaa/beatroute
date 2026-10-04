import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';

@Component({
  selector: 'app-user-profile',
  imports: [],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'user-profile-summary',
  },
})
class UserProfile {
  private readonly spotifyApi = inject(SpotifyApiService);

  readonly profileImageUrl = computed(() => {
    if (!this.spotifyApi.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyApi.userProfileResource.value()?.images?.[0]?.url ?? null;
  });

  readonly userName = computed(() => {
    if (!this.spotifyApi.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyApi.userProfileResource.value()?.display_name ?? null;
  });

  readonly userEmail = computed(() => {
    if (!this.spotifyApi.userProfileResource.hasValue()) {
      return null;
    }

    return this.spotifyApi.userProfileResource.value()?.email ?? null;
  });
}

export { UserProfile };
