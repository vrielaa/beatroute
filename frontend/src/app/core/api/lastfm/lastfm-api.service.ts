import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  ArtistGenreDistributionResponse,
  SpotifyLastfmTrackResponse,
} from '@core/api/lastfm/lastfm.models';

@Injectable({
  providedIn: 'root',
})
class LastfmApiService {
  private readonly http = inject(HttpClient);

  public getArtistGenreDistribution(
    artists: string[]
  ): Observable<ArtistGenreDistributionResponse> {
    return this.http.post<ArtistGenreDistributionResponse>(
      '/api/lastfm/artist-genres',
      { artists },
      { withCredentials: true }
    );
  }

  public getTrackInfo(spotifyTrackId: string): Observable<SpotifyLastfmTrackResponse> {
    return this.http.get<SpotifyLastfmTrackResponse>(
      `/api/lastfm/spotify-tracks/${spotifyTrackId}`,
      { withCredentials: true }
    );
  }
}

export { LastfmApiService };
