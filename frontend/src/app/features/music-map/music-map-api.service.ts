import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import { Observable } from 'rxjs';
import type { MusicMapDataset, MusicMapResponse } from './music-map.models';

@Injectable({ providedIn: 'root' })
class MusicMapApiService {
  private readonly http = inject(HttpClient);

  public getMusicMapDataset(
    timeRange: TimeRange = 'long_term',
    limit = 40
  ): Observable<MusicMapDataset> {
    return this.http.get<MusicMapDataset>('/api/music-map/dataset', {
      params: {
        time_range: timeRange,
        limit: String(limit),
      },
      withCredentials: true,
    });
  }

  public analyzeMusicMap(
    dataset: MusicMapDataset,
    clusterCount: number | null
  ): Observable<MusicMapResponse> {
    return this.http.post<MusicMapResponse>(
      '/api/music-map/analysis',
      { dataset, clusterCount },
      { withCredentials: true }
    );
  }
}

export { MusicMapApiService };
