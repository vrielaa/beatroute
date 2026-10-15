import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EMPTY, of, Subject, takeUntil } from 'rxjs';
import type { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import { prepareSavedTracksDataset } from './playlist-saved-tracks-preparation';
import type { PlaylistTrack, PreparedSavedTracksPage } from './playlist-generator.models';

const endpoint = '/api/playlist-generator/prepare-saved-tracks';

describe('prepareSavedTracksDataset', () => {
  let api: PlaylistGeneratorApiService;
  let http: HttpTestingController;
  let requestPage: (offset: number) => Observable<PreparedSavedTracksPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(PlaylistGeneratorApiService);
    http = TestBed.inject(HttpTestingController);
    requestPage = vi.fn((offset: number) => api.prepareSavedTracksPage(offset));
  });

  afterEach(() => http.verify());

  it('does not request pages or report progress before subscription', () => {
    const progress = vi.fn();

    prepareSavedTracksDataset(requestPage, progress);

    expect(requestPage).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });

  it('requests 132 positions sequentially and emits one complete dataset after all three pages', () => {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    const progress = vi.fn();
    const pages = [createPage(0, 50, 132), createPage(50, 50, 132), createPage(100, 32, 132)];
    prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error, complete });

    for (const [index, page] of pages.entries()) {
      const request = http.expectOne(endpoint);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ offset: page.pagination.offset });
      expect(request.request.withCredentials).toBe(true);
      expect(requestPage).toHaveBeenCalledTimes(index + 1);
      expect(progress).toHaveBeenCalledTimes(index);
      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      http.expectNone(() => true);

      request.flush(page);

      const processed = page.pagination.offset + page.pagination.processedItems;
      expect(progress).toHaveBeenNthCalledWith(index + 1, {
        processedTracks: processed,
        totalTracks: 132,
        preparedTracks: processed,
        skippedTracks: 0,
        completedBatches: index + 1,
        totalBatches: 3,
      });
    }

    expect(next).toHaveBeenCalledExactlyOnceWith({
      dataset: { version: 1, tracks: pages.flatMap((page) => page.preparedDataset.dataset.tracks) },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('follows the returned nextOffset rather than adding 50', () => {
    const next = vi.fn();
    prepareSavedTracksDataset(requestPage).subscribe(next);

    http.expectOne(endpoint).flush(createPage(0, 2, 3));
    const second = http.expectOne(endpoint);
    expect(second.request.body).toEqual({ offset: 2 });
    expect(next).not.toHaveBeenCalled();
    second.flush(createPage(2, 1, 3));

    expect(requestPage).toHaveBeenNthCalledWith(1, 0);
    expect(requestPage).toHaveBeenNthCalledWith(2, 2);
    expect(next).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('returns an empty library as a completed empty dataset', () => {
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    const progress = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error, complete });

    http.expectOne(endpoint).flush(createPage(0, 0, 0));

    expect(next).toHaveBeenCalledExactlyOnceWith({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(progress).toHaveBeenCalledExactlyOnceWith({
      processedTracks: 0,
      totalTracks: 0,
      preparedTracks: 0,
      skippedTracks: 0,
      completedBatches: 1,
      totalBatches: 1,
    });
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('can finish successfully with no prepared tracks while retaining unavailable-position progress', () => {
    const page = createPage(0, 3, 3, []);
    page.unavailableItemsCount = 3;
    const next = vi.fn();
    const progress = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe(next);

    http.expectOne(endpoint).flush(page);

    expect(next).toHaveBeenCalledExactlyOnceWith(page.preparedDataset);
    expect(progress).toHaveBeenCalledExactlyOnceWith({
      processedTracks: 3,
      totalTracks: 3,
      preparedTracks: 0,
      skippedTracks: 3,
      completedBatches: 1,
      totalBatches: 1,
    });
    http.expectNone(() => true);
  });

  it('deduplicates the final dataset and keeps missing measurements consistent with the first prepared occurrence', () => {
    const first = createPage(0, 2, 4, [createId(0)]);
    first.preparedDataset.dataset.tracks[0].audioFeatures.energy = null;
    first.preparedDataset.incompleteTracks = [
      { spotifyId: createId(0), missingFeatures: ['energy'] },
    ];
    first.preparedDataset.skippedTracks = [
      { spotifyId: createId(1), reason: 'audio-features-unavailable' },
    ];
    const second = createPage(2, 2, 4, [createId(0), createId(1)]);
    const next = vi.fn();
    const progress = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe(next);

    http.expectOne(endpoint).flush(first);
    expect(next).not.toHaveBeenCalled();
    http.expectOne(endpoint).flush(second);

    expect(next).toHaveBeenCalledExactlyOnceWith({
      dataset: {
        version: 1,
        tracks: [first.preparedDataset.dataset.tracks[0], second.preparedDataset.dataset.tracks[1]],
      },
      skippedTracks: [],
      incompleteTracks: first.preparedDataset.incompleteTracks,
    });
    expect(progress).toHaveBeenLastCalledWith({
      processedTracks: 4,
      totalTracks: 4,
      preparedTracks: 2,
      skippedTracks: 0,
      completedBatches: 2,
      totalBatches: 2,
    });
  });

  it('stops after ten pages at the 500-position cap even if the library contains 750 items', () => {
    const next = vi.fn();
    const progress = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe(next);

    for (let offset = 0; offset < 500; offset += 50) {
      const request = http.expectOne(endpoint);
      expect(request.request.body).toEqual({ offset });
      request.flush(createPage(offset, 50, 750));
    }

    expect(requestPage).toHaveBeenCalledTimes(10);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0].dataset.tracks).toHaveLength(500);
    expect(progress).toHaveBeenLastCalledWith({
      processedTracks: 500,
      totalTracks: 500,
      preparedTracks: 500,
      skippedTracks: 0,
      completedBatches: 10,
      totalBatches: 10,
    });
    http.expectNone(() => true);
  });

  it.each([400, 401, 403, 413, 429, 500, 502, 503, 504])(
    'forwards HTTP %i and Retry-After without emitting a dataset or retrying',
    (status) => {
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      const progress = vi.fn();
      const body = { error: { code: 'PREPARATION_ERROR', message: 'Nie udało się pobrać strony' } };
      prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error, complete });

      http.expectOne(endpoint).flush(body, {
        status,
        statusText: 'Preparation failed',
        headers: { 'Retry-After': '30' },
      });

      expect(next).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      const failure: HttpErrorResponse = error.mock.calls[0][0];
      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect(failure.status).toBe(status);
      expect(failure.error).toEqual(body);
      expect(failure.headers.get('Retry-After')).toBe('30');
      expect(requestPage).toHaveBeenCalledExactlyOnceWith(0);
      http.expectNone(() => true);
    }
  );

  it.each([50, 100])(
    'does not emit a partial dataset if the request at offset %i fails',
    (failedOffset) => {
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      const progress = vi.fn();
      prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error, complete });

      for (let offset = 0; offset < failedOffset; offset += 50) {
        http.expectOne(endpoint).flush(createPage(offset, 50, 132));
      }
      const failedRequest = http.expectOne(endpoint);
      expect(failedRequest.request.body).toEqual({ offset: failedOffset });
      failedRequest.flush(
        { error: { message: 'Failure' } },
        { status: 502, statusText: 'Bad Gateway' }
      );

      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(progress).toHaveBeenCalledTimes(failedOffset / 50);
      expect(progress).toHaveBeenLastCalledWith(
        expect.objectContaining({ processedTracks: failedOffset })
      );
      http.expectNone(() => true);
    }
  );

  it('starts a new subscription from offset zero after failure without reusing partial data', () => {
    const next = vi.fn();
    const error = vi.fn();
    const progress = vi.fn();
    const preparation = prepareSavedTracksDataset(requestPage, progress);
    preparation.subscribe({ next, error });
    http.expectOne(endpoint).flush(createPage(0, 1, 2));
    http.expectOne(endpoint).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();

    preparation.subscribe({ next, error });
    const restart = http.expectOne(endpoint);
    expect(restart.request.body).toEqual({ offset: 0 });
    const replacement = createPage(0, 1, 1, [createId(9)]);
    restart.flush(replacement);

    expect(requestPage).toHaveBeenNthCalledWith(1, 0);
    expect(requestPage).toHaveBeenNthCalledWith(2, 1);
    expect(requestPage).toHaveBeenNthCalledWith(3, 0);
    expect(next).toHaveBeenCalledExactlyOnceWith(replacement.preparedDataset);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        processedTracks: 1,
        preparedTracks: 1,
        completedBatches: 1,
      })
    );
    http.expectNone(() => true);
  });

  it.each([0, 50])(
    'cancels the pending request at offset %i and does not continue',
    (cancelledOffset) => {
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      const progress = vi.fn();
      const subscription = prepareSavedTracksDataset(requestPage, progress).subscribe({
        next,
        error,
        complete,
      });
      if (cancelledOffset === 50) {
        http.expectOne(endpoint).flush(createPage(0, 50, 132));
      }
      const pending = http.expectOne(endpoint);
      expect(pending.request.body).toEqual({ offset: cancelledOffset });

      subscription.unsubscribe();

      expect(pending.cancelled).toBe(true);
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(progress).toHaveBeenCalledTimes(cancelledOffset / 50);
      http.expectNone(() => true);
    }
  );

  it('also restarts from zero after cancellation', () => {
    const preparation = prepareSavedTracksDataset(requestPage);
    const first = preparation.subscribe();
    http.expectOne(endpoint).flush(createPage(0, 50, 132));
    const pending = http.expectOne(endpoint);
    first.unsubscribe();
    expect(pending.cancelled).toBe(true);

    const next = vi.fn();
    preparation.subscribe(next);
    const restart = http.expectOne(endpoint);
    expect(restart.request.body).toEqual({ offset: 0 });
    const replacement = createPage(0, 1, 1, [createId(9)]);
    restart.flush(replacement);

    expect(next).toHaveBeenCalledExactlyOnceWith(replacement.preparedDataset);
    http.expectNone(() => true);
  });

  it.each([1, 2])(
    'does not request another page when cancelled from progress update %i',
    (cancelAfterPage) => {
      const stop = new Subject<void>();
      let completedPages = 0;
      const progress = vi.fn(() => {
        completedPages += 1;
        if (completedPages === cancelAfterPage) {
          stop.next();
        }
      });
      const next = vi.fn();
      const error = vi.fn();
      prepareSavedTracksDataset(requestPage, progress)
        .pipe(takeUntil(stop))
        .subscribe({ next, error });

      for (let page = 0; page < cancelAfterPage; page += 1) {
        http.expectOne(endpoint).flush(createPage(page * 50, 50, 132));
      }

      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(requestPage).toHaveBeenCalledTimes(cancelAfterPage);
      http.expectNone(() => true);
    }
  );

  it('does not request another page when the progress callback throws', () => {
    const failure = new Error('Progress receiver failed');
    const progress = vi.fn(() => {
      throw failure;
    });
    const next = vi.fn();
    const error = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error });

    http.expectOne(endpoint).flush(createPage(0, 50, 132));

    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(next).not.toHaveBeenCalled();
    expect(requestPage).toHaveBeenCalledExactlyOnceWith(0);
    http.expectNone(() => true);
  });

  it('isolates completed pages and progress between simultaneous subscriptions', () => {
    const progress = vi.fn();
    const preparation = prepareSavedTracksDataset(requestPage, progress);
    const firstResult = vi.fn();
    const secondResult = vi.fn();
    preparation.subscribe(firstResult);
    preparation.subscribe(secondResult);
    const requests = http.match(endpoint);
    expect(requests).toHaveLength(2);
    const firstPage = createPage(0, 1, 1, [createId(0)]);
    const secondPage = createPage(0, 1, 1, [createId(9)]);

    requests[1].flush(secondPage);
    requests[0].flush(firstPage);

    expect(firstResult).toHaveBeenCalledExactlyOnceWith(firstPage.preparedDataset);
    expect(secondResult).toHaveBeenCalledExactlyOnceWith(secondPage.preparedDataset);
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ preparedTracks: 1, completedBatches: 1 })
    );
    expect(progress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ preparedTracks: 1, completedBatches: 1 })
    );
  });

  it('reports a synchronous page-factory failure through the Observable error channel', () => {
    const failure = new Error('Could not start the request');
    const request = vi.fn(() => {
      throw failure;
    });
    const next = vi.fn();
    const error = vi.fn();
    const preparation = prepareSavedTracksDataset(request);
    expect(request).not.toHaveBeenCalled();

    preparation.subscribe({ next, error });

    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'rejects a request completing without a page, after a previous success: %s',
    (hasFirstPage) => {
      const request = vi.fn((offset: number) =>
        hasFirstPage && offset === 0 ? of(createPage(0, 1, 2)) : EMPTY
      );
      const next = vi.fn();
      const error = vi.fn();
      const progress = vi.fn();

      prepareSavedTracksDataset(request, progress).subscribe({ next, error });

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0].message).toBe('Nie otrzymano strony zapisanych utworów');
      expect(progress).toHaveBeenCalledTimes(hasFirstPage ? 1 : 0);
    }
  );

  it.each([0, -1, 1.5, 500, 501, NaN, 2, null])(
    'rejects an invalid nextOffset %s without issuing another request',
    (nextOffset) => {
      const response = createPage(0, 1, 3);
      response.pagination.nextOffset = nextOffset;
      const next = vi.fn();
      const error = vi.fn();
      const progress = vi.fn();
      prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error });

      http.expectOne(endpoint).flush(response);

      expect(next).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0].message).toBe('Niepoprawna kolejność stron zapisanych utworów');
      expect(requestPage).toHaveBeenCalledExactlyOnceWith(0);
      http.expectNone(() => true);
    }
  );

  it('rejects a response for a different offset before recording progress', () => {
    const progress = vi.fn();
    const next = vi.fn();
    const error = vi.fn();
    prepareSavedTracksDataset(requestPage, progress).subscribe({ next, error });

    http.expectOne(endpoint).flush(createPage(50, 50, 132));

    expect(next).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(requestPage).toHaveBeenCalledExactlyOnceWith(0);
    http.expectNone(() => true);
  });
});

function createPage(
  offset: number,
  processedItems: number,
  totalItems: number,
  trackIds = Array.from({ length: processedItems }, (_, index) => createId(offset + index))
): PreparedSavedTracksPage {
  const processedThrough = offset + processedItems;
  return {
    preparedDataset: {
      dataset: { version: 1, tracks: trackIds.map(createTrack) },
      skippedTracks: [],
      incompleteTracks: [],
    },
    pagination: {
      offset,
      processedItems,
      totalItems,
      nextOffset: processedThrough < Math.min(totalItems, 500) ? processedThrough : null,
    },
    unavailableItemsCount: 0,
  };
}

function createId(index: number): string {
  return String(index + 1).padStart(22, '0');
}

function createTrack(id: string): PlaylistTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: ['Artist'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0,
      speechiness: 0.1,
      liveness: 0.2,
    },
  };
}
