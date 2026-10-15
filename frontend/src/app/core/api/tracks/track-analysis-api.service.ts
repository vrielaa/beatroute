import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { TrackAnalysisResponse } from './audio-features.models';

@Injectable({ providedIn: 'root' })
class TrackAnalysisApiService {
  private readonly http = inject(HttpClient);

  public getTracksAnalysis(trackIds: string[]): Observable<TrackAnalysisResponse> {
    return this.http.post<TrackAnalysisResponse>(
      '/api/tracks/analysis',
      { trackIds },
      { withCredentials: true }
    );
  }
}

export { TrackAnalysisApiService };
