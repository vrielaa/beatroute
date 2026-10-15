import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { AudioFeatures, AudioStats, TrackAnalysisResponse } from './audio-features.models';

@Injectable({ providedIn: 'root' })
class TrackAnalysisApiService {
  private readonly http = inject(HttpClient);

  /** Podsumowuje cały zebrany zbiór, bez kolejnego pobierania cech audio. */
  public getStatistics(audioFeatures: AudioFeatures[]): Observable<AudioStats> {
    return this.http.post<AudioStats>(
      '/api/tracks/statistics',
      { audioFeatures },
      { withCredentials: true }
    );
  }

  public getTracksAnalysis(trackIds: string[]): Observable<TrackAnalysisResponse> {
    return this.http.post<TrackAnalysisResponse>(
      '/api/tracks/analysis',
      { trackIds },
      { withCredentials: true }
    );
  }
}

export { TrackAnalysisApiService };
