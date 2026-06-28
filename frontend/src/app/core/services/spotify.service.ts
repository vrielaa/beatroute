import { inject, Injectable } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AudioStats,
  MultipleAudioFeaturesResponse,
  SpotifyUserProfile,
  TimeRange,
  TopArtistsResponse,
  TopTracksResponse,
} from '../models/models';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private readonly http = inject(HttpClient);

  public readonly userProfileResource = httpResource<SpotifyUserProfile>(() => ({
    url: '/api/me/profile',
    method: 'GET',
    withCredentials: true,
  }));

  public loginWithSpotify(): void {
    window.location.href = '/auth/spotify/login';
  }

  public checkAuth(): Observable<{ isLoggedIn: boolean }> {
    return this.http.get<{ isLoggedIn: boolean }>('/api/auth/me', {
      withCredentials: true,
    });
  }

  public getTopTracks(timeRange: TimeRange, limit = 10): Observable<TopTracksResponse> {
    return this.http.get<TopTracksResponse>('/api/me/top-tracks', {
      params: {
        time_range: timeRange,
        limit: String(limit),
      },
      withCredentials: true,
    });
  }

  public getTopArtists(timeRange: TimeRange, limit = 10): Observable<TopArtistsResponse> {
    return this.http.get<TopArtistsResponse>('/api/me/top-artists', {
      params: {
        time_range: timeRange,
        limit: String(limit),
      },
      withCredentials: true,
    });
  }

  public getTracksAudioFeatures(trackIds: string[]): Observable<MultipleAudioFeaturesResponse> {
    return this.http.post<MultipleAudioFeaturesResponse>(
      '/api/tracks/audio-features',
      { trackIds },
      { withCredentials: true }
    );
  }

  public getTracksAudioStats(trackIds: string[]): Observable<AudioStats> {
    return this.http.post<AudioStats>(
      '/api/tracks/audio-stats',
      { trackIds },
      { withCredentials: true }
    );
  }

  public logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      '/api/auth/logout',
      {},
      {
        withCredentials: true,
      }
    );
  }
}
