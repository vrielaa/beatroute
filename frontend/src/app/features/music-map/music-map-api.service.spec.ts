import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MusicMapApiService } from './music-map-api.service';
import type { MusicMapDataset } from './music-map.models';

describe('MusicMapApiService', () => {
  let service: MusicMapApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MusicMapApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads a reusable dataset for the selected listening range', () => {
    service.getMusicMapDataset('short_term', 20).subscribe();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === '/api/music-map/dataset' &&
        candidate.params.get('time_range') === 'short_term' &&
        candidate.params.get('limit') === '20'
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(createDataset());
  });

  it('sends the cached dataset to analysis without requesting source data again', () => {
    const dataset = createDataset();

    service.analyzeMusicMap(dataset, 3).subscribe();

    const request = http.expectOne('/api/music-map/analysis');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ dataset, clusterCount: 3 });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ points: [], clusters: [] });
  });
});

function createDataset(): MusicMapDataset {
  return {
    tracks: [],
    audioFeatures: [],
    metadata: {
      timeRange: 'short_term',
      requestedLimit: 20,
      spotifyReturnedTracksCount: 0,
      spotifyTotalTracksCount: 0,
    },
  };
}
