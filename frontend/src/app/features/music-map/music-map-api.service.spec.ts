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
