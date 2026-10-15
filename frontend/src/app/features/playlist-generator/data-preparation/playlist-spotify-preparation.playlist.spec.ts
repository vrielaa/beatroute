import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGeneratorApiService } from '../playlist-generator-api.service';
import { preparePlaylistDataset } from './playlist-spotify-preparation';
import type { PreparedPlaylistPage } from '../playlist-generator.models';

const playlistId = 'P'.repeat(22);
const endpoint = '/api/playlist-generator/prepare-playlist';

describe('preparePlaylistDataset', () => {
  let api: PlaylistGeneratorApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PlaylistGeneratorApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('does not start requests or emit progress before subscription', () => {
    const requestPage = vi.fn((selection) => api.preparePlaylistPage(selection));
    const progress = vi.fn();
    preparePlaylistDataset(playlistId, requestPage, progress);
    expect(requestPage).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    http.expectNone(endpoint);
  });

  it('reads pages sequentially with the original version and emits the complete dataset once', () => {
    const next = vi.fn();
    const progress = vi.fn();
    const metadata = vi.fn();
    preparePlaylistDataset(
      playlistId,
      (selection) => api.preparePlaylistPage(selection),
      progress,
      metadata
    ).subscribe(next);
    const pages = [createPage(0, 50, 115), createPage(50, 50, 115), createPage(100, 15, 115)];
    for (const [index, page] of pages.entries()) {
      const request = http.expectOne(endpoint);
      expect(request.request.body).toEqual({
        playlistId,
        offset: page.pagination.offset,
        snapshotId: index === 0 ? null : 'version-1',
      });
      expect(next).not.toHaveBeenCalled();
      http.expectNone(endpoint);
      request.flush(page);
      expect(progress).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          processedTracks: page.pagination.offset + page.pagination.processedItems,
          totalTracks: 115,
          completedBatches: index + 1,
          totalBatches: 3,
        })
      );
    }
    expect(next).toHaveBeenCalledExactlyOnceWith({
      dataset: { version: 1, tracks: pages.flatMap((page) => page.preparedDataset.dataset.tracks) },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(metadata).toHaveBeenLastCalledWith(pages[2].playlist);
    http.expectNone(endpoint);
  });

  it('deduplicates between pages without using prepared-track counts for offsets', () => {
    const next = vi.fn();
    const progress = vi.fn();
    const first = createPage(0, 2, 3);
    first.preparedDataset.dataset.tracks.pop();
    first.unavailableItemsCount = 1;
    const second = createPage(2, 1, 3);
    second.preparedDataset.dataset.tracks[0] = first.preparedDataset.dataset.tracks[0];
    preparePlaylistDataset(
      playlistId,
      (selection) => api.preparePlaylistPage(selection),
      progress
    ).subscribe(next);
    http.expectOne(endpoint).flush(first);
    const request = http.expectOne(endpoint);
    expect(request.request.body.offset).toBe(2);
    request.flush(second);
    expect(next.mock.calls[0][0].dataset.tracks).toHaveLength(1);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ processedTracks: 3, preparedTracks: 1, skippedTracks: 1 })
    );
  });

  it('accepts an empty playlist without ranking or requesting more pages', () => {
    const next = vi.fn();
    preparePlaylistDataset(playlistId, (selection) => api.preparePlaylistPage(selection)).subscribe(
      next
    );
    http.expectOne(endpoint).flush(createPage(0, 0, 0));
    expect(next.mock.calls[0][0].dataset.tracks).toEqual([]);
    http.expectNone(() => true);
  });

  it('stops at 500 positions for a larger source', () => {
    const next = vi.fn();
    const progress = vi.fn();
    preparePlaylistDataset(
      playlistId,
      (selection) => api.preparePlaylistPage(selection),
      progress
    ).subscribe(next);
    for (let offset = 0; offset < 500; offset += 50)
      http.expectOne(endpoint).flush(createPage(offset, 50, 750));
    expect(next.mock.calls[0][0].dataset.tracks).toHaveLength(500);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        processedTracks: 500,
        totalTracks: 500,
        completedBatches: 10,
        totalBatches: 10,
      })
    );
    http.expectNone(endpoint);
  });

  it.each(['id', 'snapshot', 'total'])(
    'rejects an inconsistent %s before requesting another page',
    (changed) => {
      const error = vi.fn();
      const next = vi.fn();
      preparePlaylistDataset(playlistId, (selection) =>
        api.preparePlaylistPage(selection)
      ).subscribe({ next, error });
      http.expectOne(endpoint).flush(createPage(0, 1, 3));
      const second = createPage(1, 1, 3);
      if (changed === 'id') second.playlist.id = 'other';
      if (changed === 'snapshot') second.playlist.snapshotId = 'new-version';
      if (changed === 'total') second.pagination.totalItems = 4;
      http.expectOne(endpoint).flush(second);
      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      http.expectNone(endpoint);
    }
  );

  it.each([409, 429, 502])(
    'does not emit partial data on HTTP %i and restarts with no old snapshot',
    (status) => {
      const next = vi.fn();
      const error = vi.fn();
      const preparation = preparePlaylistDataset(playlistId, (selection) =>
        api.preparePlaylistPage(selection)
      );
      preparation.subscribe({ next, error });
      http.expectOne(endpoint).flush(createPage(0, 1, 2));
      http.expectOne(endpoint).flush({}, { status, statusText: 'Failure' });
      expect(next).not.toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
      preparation.subscribe(next);
      const restarted = http.expectOne(endpoint);
      expect(restarted.request.body).toEqual({ playlistId, offset: 0, snapshotId: null });
      restarted.flush(createPage(0, 0, 0));
      expect(next).toHaveBeenCalledOnce();
    }
  );

  it('cancels an in-flight page and does not start another one', () => {
    const next = vi.fn();
    const subscription = preparePlaylistDataset(playlistId, (selection) =>
      api.preparePlaylistPage(selection)
    ).subscribe(next);
    http.expectOne(endpoint).flush(createPage(0, 1, 3));
    const pending = http.expectOne(endpoint);
    subscription.unsubscribe();
    expect(pending.cancelled).toBe(true);
    expect(next).not.toHaveBeenCalled();
    http.expectNone(endpoint);
  });
});

function createPage(offset: number, count: number, total: number): PreparedPlaylistPage {
  return {
    playlist: { id: playlistId, name: 'Summer', snapshotId: 'version-1' },
    preparedDataset: {
      dataset: {
        version: 1,
        tracks: Array.from({ length: count }, (_, index) => ({
          id: String(offset + index).padStart(22, '0'),
          name: `Song ${offset + index}`,
          artists: ['Artist'],
          audioFeatures: {
            tempo: 128,
            energy: 0.8,
            danceability: 0.7,
            valence: 0.6,
            acousticness: 0.1,
            instrumentalness: 0,
            speechiness: 0.1,
            liveness: 0.2,
          },
        })),
      },
      skippedTracks: [],
      incompleteTracks: [],
    },
    pagination: {
      offset,
      processedItems: count,
      totalItems: total,
      nextOffset: offset + count < Math.min(total, 500) ? offset + count : null,
    },
    unavailableItemsCount: 0,
  };
}
