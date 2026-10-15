import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import { RETRY_RATE_LIMITED_READS } from '@core/interceptors/rate-limit-retry.interceptor';
import type { Observable } from 'rxjs';
import type { TopTracksBatch, TopTracksPurpose } from './top-tracks.models';

@Injectable({ providedIn: 'root' })
class TopTracksApiService {
  private readonly http = inject(HttpClient);

  /** Czyta jedną partię. 429 trafia od razu do widoku, bez automatycznego ponawiania. */
  public getBatch(
    timeRange: TimeRange,
    limit: number,
    offset: number,
    purpose: TopTracksPurpose
  ): Observable<TopTracksBatch> {
    return this.http.get<TopTracksBatch>('/api/me/top-tracks/dataset', {
      params: { time_range: timeRange, limit: String(limit), offset: String(offset), purpose },
      context: new HttpContext().set(RETRY_RATE_LIMITED_READS, false),
      withCredentials: true,
    });
  }
}

export { TopTracksApiService };
