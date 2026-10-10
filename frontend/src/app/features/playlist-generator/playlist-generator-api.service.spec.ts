import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import type { GeneratedPlaylist, PlaylistGeneratorRequest } from './playlist-generator.models';

describe('PlaylistGeneratorApiService', () => {
  let service: PlaylistGeneratorApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlaylistGeneratorApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('does not send a request before subscription', () => {
    service.generatePlaylist(createRequest());

    http.expectNone('/api/playlist-generator/generate');
  });

  it('posts the dataset, requirements and preferences without removing null values', () => {
    const body = createRequest();

    service.generatePlaylist(body).subscribe();

    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.method).toBe('POST');
    expect(request.request.urlWithParams).toBe('/api/playlist-generator/generate');
    expect(request.request.body).toEqual(body);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('passes through ranked tracks, feature matches and rejection reasons unchanged', () => {
    const body = createRequest();
    const response: GeneratedPlaylist = {
      rankedTracks: [
        {
          track: body.dataset.tracks[0],
          overallMatch: 1,
          featureMatches: [{ feature: 'energy', level: 'high', measurement: 0.8, match: 1 }],
        },
      ],
      rejectedTracks: [
        {
          track: body.dataset.tracks[1],
          reasons: [{ feature: 'tempo', code: 'missing-measurement' }],
        },
      ],
    };
    const next = vi.fn();

    service.generatePlaylist(body).subscribe(next);

    http.expectOne('/api/playlist-generator/generate').flush(response);

    expect(next).toHaveBeenCalledExactlyOnceWith(response);
  });

  it('preserves disabled requirements and preferences as explicit null values', () => {
    const body = createRequest();
    body.requirements = { tempoRange: null, maxSpeechiness: null, maxLiveness: null };
    body.preferences = {
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    };

    service.generatePlaylist(body).subscribe();

    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.body).toEqual(body);
    request.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('treats an empty ranking as a successful result', () => {
    const body = createRequest();
    body.requirements.tempoRange = { min: 140, max: 160 };
    const response: GeneratedPlaylist = {
      rankedTracks: [],
      rejectedTracks: [
        {
          track: body.dataset.tracks[0],
          reasons: [{ feature: 'tempo', code: 'outside-range' }],
        },
        {
          track: body.dataset.tracks[1],
          reasons: [{ feature: 'tempo', code: 'missing-measurement' }],
        },
      ],
    };
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();

    service.generatePlaylist(body).subscribe({ next, error, complete });

    http.expectOne('/api/playlist-generator/generate').flush(response);

    expect(next).toHaveBeenCalledExactlyOnceWith(response);
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 400, statusText: 'Bad Request', code: 'VALIDATION_ERROR' },
    { status: 413, statusText: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE' },
    { status: 500, statusText: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR' },
  ])(
    'passes HTTP $status to the error subscriber without returning an empty playlist',
    (failure) => {
      const response = {
        error: { code: failure.code, message: 'Nie udało się wygenerować playlisty' },
      };
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();

      service.generatePlaylist(createRequest()).subscribe({ next, error, complete });

      http.expectOne('/api/playlist-generator/generate').flush(response, failure);

      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
      expect(error.mock.calls[0][0]).toMatchObject({
        status: failure.status,
        error: response,
      });
    }
  );
});

function createRequest(): PlaylistGeneratorRequest {
  const track = {
    id: 'track-1',
    name: 'First track',
    artists: ['Example artist'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: null,
      instrumentalness: 0,
      speechiness: 0.1,
      liveness: null,
    },
  };

  return {
    dataset: {
      version: 1,
      tracks: [
        track,
        {
          ...track,
          id: 'track-2',
          name: 'Second track',
          audioFeatures: { ...track.audioFeatures, tempo: null },
        },
      ],
    },
    requirements: {
      tempoRange: { min: 120, max: 140 },
      maxSpeechiness: 0.33,
      maxLiveness: null,
    },
    preferences: {
      energy: 'high',
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    },
  };
}
