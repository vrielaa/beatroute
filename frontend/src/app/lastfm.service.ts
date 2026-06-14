import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ArtistGenreDistributionResponse,
  SpotifyLastfmTrackResponse,
  SpotifyTrackSummary,
} from './core/models/models';

interface SpotifyNowPlayingResponse {
  spotify: SpotifyTrackSummary;
  nowPlaying: unknown;
}

interface SpotifyScrobbleResponse {
  spotify: SpotifyTrackSummary;
  scrobbles: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class LastfmService {
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

  public updateNowPlaying(spotifyTrackId: string): Observable<SpotifyNowPlayingResponse> {
    return this.http.post<SpotifyNowPlayingResponse>(
      `/api/lastfm/spotify-tracks/${spotifyTrackId}/now-playing`,
      {},
      { withCredentials: true }
    );
  }

  public scrobble(
    spotifyTrackId: string,
    timestamp: number,
    chosenByUser = true
  ): Observable<SpotifyScrobbleResponse> {
    return this.http.post<SpotifyScrobbleResponse>(
      `/api/lastfm/spotify-tracks/${spotifyTrackId}/scrobble`,
      { timestamp, chosenByUser },
      { withCredentials: true }
    );
  }
}
