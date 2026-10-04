import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  SpotifyUserProfile,
  TimeRange,
  TopArtistsResponse,
  TopTracksResponse,
} from './spotify.models';

@Injectable({ providedIn: 'root' })
class SpotifyApiService {
  private readonly http = inject(HttpClient);

  public readonly userProfileResource = httpResource<SpotifyUserProfile>(() => ({
    url: '/api/me/profile',
    method: 'GET',
    withCredentials: true,
  }));

  public getTopTracks(timeRange: TimeRange, limit = 10): Observable<TopTracksResponse> {
    return this.http.get<TopTracksResponse>('/api/me/top-tracks', {
      params: { time_range: timeRange, limit: String(limit) },
      withCredentials: true,
    });
  }

  public getTopArtists(timeRange: TimeRange, limit = 10): Observable<TopArtistsResponse> {
    return this.http.get<TopArtistsResponse>('/api/me/top-artists', {
      params: { time_range: timeRange, limit: String(limit) },
      withCredentials: true,
    });
  }
}

export { SpotifyApiService };
