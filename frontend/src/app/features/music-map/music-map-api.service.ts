import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import { Observable } from 'rxjs';
import type { MusicMapResponse } from './music-map.models';

@Injectable({ providedIn: 'root' })
class MusicMapApiService {
  private readonly http = inject(HttpClient);

  public getMusicMap(
    timeRange: TimeRange = 'long_term',
    limit = 40,
    clusters?: number
  ): Observable<MusicMapResponse> {
    return this.http.get<MusicMapResponse>('/api/music-map/playground', {
      params: {
        time_range: timeRange,
        limit: String(limit),
        ...(clusters ? { clusters: String(clusters) } : {}),
      },
      withCredentials: true,
    });
  }
}

export { MusicMapApiService };
