import { inject, Injectable } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { TimeRange, TopTracksResponse, MultipleAudioFeaturesResponse } from './core/models/models';
import { Observable } from 'rxjs/internal/Observable';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  public loginWithSpotify(): void {
    window.location.href = '/auth/spotify/login';
  }

  private readonly http = inject(HttpClient);

  public authResource = httpResource<{ isLoggedIn: boolean }>(() => ({
    url: '/api/auth/me',
    method: 'GET',
    withCredentials: true,
  }));

  public checkAuth() {
    return this.http.get<{ isLoggedIn: boolean }>('/api/auth/me', {
      withCredentials: true,
    });
  }

  public userProfileResource = httpResource<any>(() => ({
    url: '/api/me/profile',
    method: 'GET',
    withCredentials: true,
  }));

  public getTopTracks(timeRange: TimeRange, limit = 10): Observable<TopTracksResponse> {
    return this.http.get<TopTracksResponse>('/api/me/top-tracks', {
      params: {
        time_range: timeRange,
        limit: String(limit),
      },
      withCredentials: true,
    });
  }

  public getTracksAudioFeatures(trackIds: string[]): Observable<any> {
    return this.http.post(
      '/api/tracks/audio-features',
      { trackIds },
      { withCredentials: true },
    );
  }

  public logout() {
    return this.http.post(
      '/api/auth/logout',
      {},
      {
        withCredentials: true,
      }
    );
  }
  readonly userProfile = this.userProfileResource.value;
}
