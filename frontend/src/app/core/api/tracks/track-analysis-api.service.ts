import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { AudioStats, MultipleAudioFeaturesResponse } from './audio-features.models';

@Injectable({ providedIn: 'root' })
class TrackAnalysisApiService {
  private readonly http = inject(HttpClient);

  public getAudioFeatures(trackIds: string[]): Observable<MultipleAudioFeaturesResponse> {
    return this.http.post<MultipleAudioFeaturesResponse>(
      '/api/tracks/audio-features',
      { trackIds },
      { withCredentials: true }
    );
  }

  public getAudioStats(trackIds: string[]): Observable<AudioStats> {
    return this.http.post<AudioStats>(
      '/api/tracks/audio-stats',
      { trackIds },
      { withCredentials: true }
    );
  }
}

export { TrackAnalysisApiService };
