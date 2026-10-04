import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LastfmApiService } from './lastfm-api.service';

describe('LastfmApiService', () => {
  let service: LastfmApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LastfmApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts artist names to the genre distribution endpoint', () => {
    service.getArtistGenreDistribution(['Radiohead', 'Björk']).subscribe();

    const request = http.expectOne('/api/lastfm/artist-genres');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ artists: ['Radiohead', 'Björk'] });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ genres: [] });
  });

  it('requests combined Spotify and Last.fm track data', () => {
    service.getTrackInfo('spotify-track-id').subscribe();

    const request = http.expectOne('/api/lastfm/spotify-tracks/spotify-track-id');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ spotify: {}, lastfm: {} });
  });
});
