import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TrackAnalysisApiService } from './track-analysis-api.service';

describe('TrackAnalysisApiService', () => {
  let service: TrackAnalysisApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrackAnalysisApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts track IDs when requesting audio features', () => {
    service.getAudioFeatures(['track-1', 'track-2']).subscribe();

    const request = http.expectOne('/api/tracks/audio-features');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ trackIds: ['track-1', 'track-2'] });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ audio_features: [] });
  });

  it('posts track IDs when requesting aggregate statistics', () => {
    service.getAudioStats(['track-1']).subscribe();

    const request = http.expectOne('/api/tracks/audio-stats');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ trackIds: ['track-1'] });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ trackCount: 1 });
  });

  it('posts track IDs when requesting combined analysis', () => {
    service.getTracksAnalysis(['track-1', 'track-2']).subscribe();

    const request = http.expectOne('/api/tracks/analysis');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ trackIds: ['track-1', 'track-2'] });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ stats: { trackCount: 2 }, audioFeatures: [] });
  });
});
