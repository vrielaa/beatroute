import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import type {
  GeneratedPlaylist,
  PlaylistGeneratorRequest,
  PlaylistTrackIdsFile,
  PlaylistToSave,
  PlaylistSaveProgress,
  PreparedPlaylistDataset,
  PreparedSavedTracksPage,
  SavedPlaylist,
  PreparedPlaylistPage,
} from './playlist-generator.models';

describe('PlaylistGeneratorApiService', () => {
  let service: PlaylistGeneratorApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PlaylistGeneratorApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('preparePlaylistPage', () => {
    const url = '/api/playlist-generator/prepare-playlist';
    const selection = { playlistId: 'P'.repeat(22), offset: 0, snapshotId: null };
    const response: PreparedPlaylistPage = {
      playlist: { id: selection.playlistId, name: 'Summer', snapshotId: 'version-1' },
      preparedDataset: {
        dataset: { version: 1, tracks: [] },
        skippedTracks: [],
        incompleteTracks: [],
      },
      pagination: { offset: 0, processedItems: 0, totalItems: 0, nextOffset: null },
      unavailableItemsCount: 0,
    };

    it('does not fetch before subscription', () => {
      service.preparePlaylistPage(selection);
      http.expectNone(url);
    });

    it('posts only source selection and sends the session cookie', () => {
      const next = vi.fn();
      const extendedSelection = { ...selection, accessToken: 'untrusted' };
      service.preparePlaylistPage(extendedSelection).subscribe(next);
      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(selection);
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush(response);
      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      http.expectNone('/api/playlist-generator/generate');
    });

    it('preserves the snapshot and offset on continuation', () => {
      const following = { ...selection, offset: 50, snapshotId: 'version-1' };
      service.preparePlaylistPage(following).subscribe();
      const request = http.expectOne(url);
      expect(request.request.body).toEqual(following);
      request.flush(response);
      http.expectNone(url);
    });

    it.each([400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504])(
      'preserves HTTP %i without retrying or returning partial success',
      (status) => {
        const error = vi.fn();
        const next = vi.fn();
        service.preparePlaylistPage(selection).subscribe({ next, error });
        http
          .expectOne(url)
          .flush(
            { error: { code: 'SOURCE_ERROR' } },
            { status, statusText: 'Failure', headers: { 'Retry-After': '60' } }
          );
        expect(next).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledOnce();
        const failure: HttpErrorResponse = error.mock.calls[0][0];
        expect(failure.status).toBe(status);
        expect(failure.headers.get('Retry-After')).toBe('60');
        http.expectNone(url);
      }
    );

    it('cancels the pending HTTP request', () => {
      const subscription = service.preparePlaylistPage(selection).subscribe();
      const request = http.expectOne(url);
      subscription.unsubscribe();
      expect(request.cancelled).toBe(true);
    });
  });

  describe('prepareDataset', () => {
    const file: PlaylistTrackIdsFile = {
      version: 1,
      spotifyTrackIds: ['3sNVsP50132BTNlImLx70i'],
    };
    const url = '/api/playlist-generator/prepare-dataset';

    it('does not read API data before subscription', () => {
      service.prepareDataset(file);
      http.expectNone(url);
    });

    it('posts only the file and sends the session cookie', () => {
      service.prepareDataset(file).subscribe();

      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.urlWithParams).toBe(url);
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.body).toEqual(file);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({
        dataset: { version: 1, tracks: [] },
        skippedTracks: [],
        incompleteTracks: [],
      });
    });

    it('passes the dataset, skipped IDs and missing measurements through unchanged', () => {
      const dataset = createRequest().dataset;
      const response: PreparedPlaylistDataset = {
        dataset,
        skippedTracks: [{ spotifyId: '4U4LEUWV8sFtos5PdjfDA7', reason: 'metadata-unavailable' }],
        incompleteTracks: [{ spotifyId: dataset.tracks[1].id, missingFeatures: ['tempo'] }],
      };
      const next = vi.fn();
      service.prepareDataset(file).subscribe(next);

      http.expectOne(url).flush(response);

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      http.expectNone('/api/playlist-generator/generate');
    });

    it('does not turn an empty prepared dataset into a request failure', () => {
      const response: PreparedPlaylistDataset = {
        dataset: { version: 1, tracks: [] },
        skippedTracks: [
          { spotifyId: file.spotifyTrackIds[0], reason: 'audio-features-unavailable' },
        ],
        incompleteTracks: [],
      };
      const next = vi.fn();
      const error = vi.fn();
      service.prepareDataset(file).subscribe({ next, error });

      http.expectOne(url).flush(response);

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      expect(error).not.toHaveBeenCalled();
    });

    it.each([400, 401, 403, 413, 429, 500, 502, 503, 504])(
      'passes HTTP %s to the caller without returning an empty dataset',
      (status) => {
        const next = vi.fn();
        const error = vi.fn();
        service.prepareDataset(file).subscribe({ next, error });

        http.expectOne(url).flush(
          { error: { message: 'Failure' } },
          {
            status,
            statusText: 'Request failed',
            headers: { 'Retry-After': '30' },
          }
        );

        expect(next).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledOnce();
        const failure: HttpErrorResponse = error.mock.calls[0][0];
        expect(failure.status).toBe(status);
        expect(failure.headers.get('Retry-After')).toBe('30');
      }
    );

    it('cancels preparation when the subscription is closed', () => {
      const subscription = service.prepareDataset(file).subscribe();
      const request = http.expectOne(url);

      subscription.unsubscribe();

      expect(request.cancelled).toBe(true);
    });
  });

  describe('prepareSavedTracksPage', () => {
    const url = '/api/playlist-generator/prepare-saved-tracks';

    it('does not send a request before subscription', () => {
      service.prepareSavedTracksPage(0);

      http.expectNone(url);
    });

    it.each([0, 50, 499])('posts only offset %i and sends the session cookie', (offset) => {
      service.prepareSavedTracksPage(offset).subscribe();

      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.urlWithParams).toBe(url);
      expect(request.request.body).toEqual({ offset });
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush(createPreparedSavedTracksPage(offset));
    });

    it('passes tracks, missing measurements, skipped IDs and pagination through unchanged', () => {
      const response = createPreparedSavedTracksPage();
      response.preparedDataset.skippedTracks = [
        { spotifyId: '4U4LEUWV8sFtos5PdjfDA7', reason: 'audio-features-unavailable' },
      ];
      response.pagination.processedItems = 3;
      response.pagination.totalItems = 3;
      response.unavailableItemsCount = 1;
      const next = vi.fn();
      const complete = vi.fn();
      service.prepareSavedTracksPage(0).subscribe({ next, complete });

      http.expectOne(url).flush(response);

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      expect(complete).toHaveBeenCalledOnce();
      http.expectNone('/api/playlist-generator/prepare-dataset');
      http.expectNone('/api/playlist-generator/generate');
      http.expectNone('/api/playlist-generator/save');
    });

    it('does not request another page when the response contains nextOffset', () => {
      const response = createPreparedSavedTracksPage();
      response.pagination = {
        offset: 0,
        processedItems: 1,
        totalItems: 2,
        nextOffset: 1,
      };
      const next = vi.fn();
      service.prepareSavedTracksPage(0).subscribe(next);

      http.expectOne(url).flush(response);

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      http.expectNone(url);
    });

    it('returns an empty library as success, preserving nextOffset null', () => {
      const response: PreparedSavedTracksPage = {
        preparedDataset: {
          dataset: { version: 1, tracks: [] },
          skippedTracks: [],
          incompleteTracks: [],
        },
        pagination: { offset: 0, processedItems: 0, totalItems: 0, nextOffset: null },
        unavailableItemsCount: 0,
      };
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      service.prepareSavedTracksPage(0).subscribe({ next, error, complete });

      http.expectOne(url).flush(response);

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      expect(error).not.toHaveBeenCalled();
      expect(complete).toHaveBeenCalledOnce();
      http.expectNone(url);
    });

    it.each([
      { status: 400, code: 'VALIDATION_ERROR' },
      { status: 401, code: 'SPOTIFY_AUTH_REQUIRED' },
      { status: 403, code: 'SPOTIFY_LIBRARY_PERMISSION_REQUIRED' },
      { status: 413, code: 'PAYLOAD_TOO_LARGE' },
      { status: 429, code: 'SPOTIFY_API_ERROR' },
      { status: 500, code: 'INTERNAL_SERVER_ERROR' },
      { status: 502, code: 'SPOTIFY_API_ERROR' },
      { status: 503, code: 'RECCOBEATS_API_ERROR' },
      { status: 504, code: 'RECCOBEATS_API_ERROR' },
    ])(
      'passes HTTP $status and Retry-After through without retrying the POST',
      ({ status, code }) => {
        const response = {
          error: { code, message: 'Nie udało się przygotować zapisanych utworów' },
        };
        const next = vi.fn();
        const error = vi.fn();
        const complete = vi.fn();
        service.prepareSavedTracksPage(50).subscribe({ next, error, complete });

        http.expectOne(url).flush(response, {
          status,
          statusText: 'Preparation failed',
          headers: { 'Retry-After': '30' },
        });

        expect(next).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledOnce();
        const failure: HttpErrorResponse = error.mock.calls[0][0];
        expect(failure).toBeInstanceOf(HttpErrorResponse);
        expect(failure.status).toBe(status);
        expect(failure.error).toEqual(response);
        expect(failure.headers.get('Retry-After')).toBe('30');
        http.expectNone(url);
      }
    );

    it('passes network failures to the caller without returning an empty page', () => {
      const next = vi.fn();
      const error = vi.fn();
      service.prepareSavedTracksPage(0).subscribe({ next, error });
      const networkError = new ProgressEvent('error');

      http.expectOne(url).error(networkError);

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toMatchObject({ status: 0, error: networkError });
      http.expectNone(url);
    });

    it('cancels the pending request when the subscription is closed', () => {
      const next = vi.fn();
      const error = vi.fn();
      const subscription = service.prepareSavedTracksPage(0).subscribe({ next, error });
      const request = http.expectOne(url);

      subscription.unsubscribe();

      expect(request.cancelled).toBe(true);
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      http.expectNone(url);
    });
  });

  describe('savePlaylist', () => {
    const url = '/api/playlist-generator/save';

    it('does not send a save request before subscription', () => {
      service.savePlaylist(createSelection());

      http.expectNone(url);
    });

    it('posts only the name and selected IDs in order and sends the session cookie', () => {
      const playlist = {
        ...createSelection(),
        accessToken: 'body-token',
        public: true,
        playlistId: 'existing-playlist',
        dataset: createRequest().dataset,
      };
      service.savePlaylist(playlist).subscribe();

      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.urlWithParams).toBe(url);
      expect(request.request.body).toEqual(createSelection());
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
      http.expectNone('/api/playlist-generator/prepare-dataset');
      http.expectNone('/api/playlist-generator/generate');
    });

    it('captures the selection without retaining the caller’s mutable ID array', () => {
      const playlist = createSelection();
      const original = structuredClone(playlist);
      const result = service.savePlaylist(playlist);

      playlist.name = 'Changed name';
      playlist.trackIds.reverse();
      result.subscribe();

      const request = http.expectOne(url);
      expect(request.request.body).toEqual(original);
      expect(request.request.body.trackIds).not.toBe(playlist.trackIds);
      request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    });

    it('passes a complete 201 save response through unchanged', () => {
      const response = createSavedPlaylist();
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      service.savePlaylist(createSelection()).subscribe({ next, error, complete });

      http.expectOne(url).flush(response, { status: 201, statusText: 'Created' });

      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      expect(error).not.toHaveBeenCalled();
      expect(complete).toHaveBeenCalledOnce();
    });

    it.each([
      { status: 400, code: 'VALIDATION_ERROR' },
      { status: 401, code: 'SPOTIFY_AUTH_REQUIRED' },
      { status: 403, code: 'SPOTIFY_PLAYLIST_PERMISSION_REQUIRED' },
      { status: 413, code: 'PAYLOAD_TOO_LARGE' },
      { status: 429, code: 'SPOTIFY_API_ERROR' },
      { status: 500, code: 'INTERNAL_SERVER_ERROR' },
      { status: 502, code: 'SPOTIFY_API_ERROR' },
      { status: 503, code: 'SPOTIFY_API_ERROR' },
      { status: 504, code: 'SPOTIFY_API_ERROR' },
    ])('passes HTTP $status through without retrying the POST', ({ status, code }) => {
      const response = { error: { code, message: 'Nie udało się zapisać playlisty' } };
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      service.savePlaylist(createSelection()).subscribe({ next, error, complete });

      http.expectOne(url).flush(response, {
        status,
        statusText: 'Save failed',
        headers: { 'Retry-After': '30' },
      });

      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      const failure: HttpErrorResponse = error.mock.calls[0][0];
      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect(failure.status).toBe(status);
      expect(failure.error).toEqual(response);
      expect(failure.headers.get('Retry-After')).toBe('30');
      http.expectNone(url);
    });

    it.each([0, 100])(
      'preserves partial-save progress with %i confirmations as an error, not success',
      (confirmedTrackCount) => {
        const response = {
          error: {
            code: 'PLAYLIST_SAVE_INCOMPLETE',
            message: 'Sprawdź utworzoną playlistę przed ponownym zapisem.',
            details: {
              progress: {
                id: 'new-playlist-id',
                name: 'Na siłownię',
                spotifyUrl: 'https://open.spotify.com/playlist/new-playlist-id',
                confirmedTrackCount,
                requestedTrackCount: 250,
              },
              retryAfterSeconds: 30,
            },
          },
        };
        const next = vi.fn();
        const error = vi.fn();
        const playlist = {
          name: 'Na siłownię',
          trackIds: Array.from({ length: 250 }, (_, index) => index.toString(36).padStart(22, '0')),
        };
        service.savePlaylist(playlist).subscribe({ next, error });

        http.expectOne(url).flush(response, {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '30' },
        });

        expect(next).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledOnce();
        const failure: HttpErrorResponse = error.mock.calls[0][0];
        expect(failure.error).toEqual(response);
        expect(failure.headers.get('Retry-After')).toBe('30');
        http.expectNone(url);
      }
    );

    it.each([
      {},
      { ...createSavedPlaylist(), trackCount: 1 },
      { ...createSavedPlaylist(), spotifyUrl: 'https://example.com/playlist/new-playlist-id' },
    ])('rejects an invalid 201 confirmation without another POST: %j', (response) => {
      const next = vi.fn();
      const error = vi.fn();
      service.savePlaylist(createSelection()).subscribe({ next, error });

      http.expectOne(url).flush(response, { status: 201, statusText: 'Created' });

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
      http.expectNone(url);
    });

    it('passes a network error through without starting another save', () => {
      const next = vi.fn();
      const error = vi.fn();
      service.savePlaylist(createSelection()).subscribe({ next, error });

      http.expectOne(url).error(new ProgressEvent('error'));

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
      expect(error.mock.calls[0][0].status).toBe(0);
      http.expectNone(url);
    });

    it('cancels the HTTP subscription without sending another save request', () => {
      const next = vi.fn();
      const error = vi.fn();
      const subscription = service.savePlaylist(createSelection()).subscribe({ next, error });
      const request = http.expectOne(url);

      subscription.unsubscribe();

      expect(request.cancelled).toBe(true);
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      http.expectNone(url);
    });
  });

  describe('resumePlaylist', () => {
    const url = '/api/playlist-generator/resume-save';
    const progress: PlaylistSaveProgress = {
      id: 'p'.repeat(22),
      name: 'Playlist',
      spotifyUrl: `https://open.spotify.com/playlist/${'p'.repeat(22)}`,
      confirmedTrackCount: 1,
      requestedTrackCount: 2,
    };
    const response: SavedPlaylist = {
      id: progress.id,
      name: progress.name,
      spotifyUrl: progress.spotifyUrl,
      trackCount: 2,
    };

    it('does nothing before subscription and sends only the playlist ID with the session cookie', () => {
      const next = vi.fn();
      const operation = service.resumePlaylist(progress);
      http.expectNone(() => true);

      operation.subscribe(next);

      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBe(true);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.body).toEqual({ playlistId: progress.id });
      request.flush(response);
      expect(next).toHaveBeenCalledExactlyOnceWith(response);
      http.expectNone('/api/playlist-generator/save');
      http.expectNone('/api/playlist-generator/generate');
    });

    it('captures the original ID and count before the caller mutates progress', () => {
      const mutable = { ...progress };
      const operation = service.resumePlaylist(mutable);
      mutable.id = 'changed';
      mutable.requestedTrackCount = 100;
      const next = vi.fn();
      operation.subscribe(next);
      const request = http.expectOne(url);
      expect(request.request.body).toEqual({ playlistId: progress.id });
      request.flush(response);
      expect(next).toHaveBeenCalledExactlyOnceWith(response);
    });

    it.each([400, 401, 403, 409, 413, 429, 500, 502, 503, 504])(
      'preserves HTTP %s and Retry-After without retrying',
      (status) => {
        const next = vi.fn();
        const error = vi.fn();
        service.resumePlaylist(progress).subscribe({ next, error });
        const body = { error: { code: 'PLAYLIST_SAVE_INCOMPLETE', details: { progress } } };
        http
          .expectOne(url)
          .flush(body, { status, statusText: 'Failed', headers: { 'Retry-After': '30' } });
        expect(next).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledOnce();
        expect(error.mock.calls[0][0].error).toEqual(body);
        expect(error.mock.calls[0][0].headers.get('Retry-After')).toBe('30');
        http.expectNone(() => true);
      }
    );

    it.each([
      {},
      { ...response, trackCount: 1 },
      { ...response, spotifyUrl: 'https://untrusted.test' },
      { ...response, id: 'another', spotifyUrl: 'https://open.spotify.com/playlist/another' },
    ])('rejects an invalid confirmation without another write: %j', (body) => {
      const next = vi.fn();
      const error = vi.fn();
      service.resumePlaylist(progress).subscribe({ next, error });
      http.expectOne(url).flush(body);
      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      http.expectNone(() => true);
    });

    it('cancels local waiting without another request', () => {
      const subscription = service.resumePlaylist(progress).subscribe();
      const request = http.expectOne(url);
      subscription.unsubscribe();
      expect(request.cancelled).toBe(true);
      http.expectNone(() => true);
    });
  });

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
    body.requirements = {
      targetBpm: null,
      tempoRange: null,
      maxSpeechiness: null,
      maxLiveness: null,
    };
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

  it('sends target BPM and a null range without changing the criteria or returned reasons', () => {
    const body = createRequest();
    body.requirements = {
      tempoRange: null,
      targetBpm: 128,
      maxSpeechiness: null,
      maxLiveness: null,
    };
    const response: GeneratedPlaylist = {
      rankedTracks: [],
      rejectedTracks: [
        {
          track: body.dataset.tracks[0],
          reasons: [{ feature: 'tempo', code: 'tempo-mismatch' }],
        },
      ],
    };
    const next = vi.fn();

    service.generatePlaylist(body).subscribe(next);

    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.requirements).toEqual(body.requirements);
    request.flush(response);
    expect(next).toHaveBeenCalledExactlyOnceWith(response);
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

function createPreparedSavedTracksPage(offset = 0): PreparedSavedTracksPage {
  const track = {
    ...createRequest().dataset.tracks[0],
    id: '3sNVsP50132BTNlImLx70i',
  };

  return {
    preparedDataset: {
      dataset: { version: 1, tracks: [track] },
      skippedTracks: [],
      incompleteTracks: [{ spotifyId: track.id, missingFeatures: ['acousticness', 'liveness'] }],
    },
    pagination: {
      offset,
      processedItems: 1,
      totalItems: offset + 1,
      nextOffset: null,
    },
    unavailableItemsCount: 0,
  };
}

function createSelection(): PlaylistToSave {
  return {
    name: 'Na siłownię',
    trackIds: ['4U4LEUWV8sFtos5PdjfDA7', '3sNVsP50132BTNlImLx70i'],
  };
}

function createSavedPlaylist(): SavedPlaylist {
  return {
    id: 'new-playlist-id',
    name: 'Na siłownię',
    spotifyUrl: 'https://open.spotify.com/playlist/new-playlist-id',
    trackCount: 2,
  };
}

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
      targetBpm: null,
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
