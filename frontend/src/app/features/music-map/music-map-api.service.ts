import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { MusicMapDataset, MusicMapResponse } from './music-map.models';

@Injectable({ providedIn: 'root' })
class MusicMapApiService {
  private readonly http = inject(HttpClient);

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
