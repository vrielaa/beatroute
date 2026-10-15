import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopTracksCollector } from './top-tracks-collector.service';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import type { TopTracksBatch, TopTracksCollection } from '@core/api/tracks/top-tracks.models';

describe('TopTracksCollector', () => {
  let collector: TopTracksCollector;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    collector = TestBed.inject(TopTracksCollector);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('fills 7/10, then 9/10, then 10/10 with source offsets and only missing counts', () => {
    const states: TopTracksCollection[] = [];
    collector.collect('short_term', 10, 'statistics').subscribe((state) => states.push(state));
    pageRequest(10, 0).flush(batch(0, 10, 7, 20));
    pageRequest(3, 10).flush(batch(10, 3, 2, 20));
    pageRequest(1, 13).flush(batch(13, 1, 1, 20));

    expect(states.map((state) => state.progress.foundTracks)).toEqual([0, 7, 9, 10]);
    expect(states.map((state) => state.progress.skippedItems)).toEqual([0, 3, 4, 4]);
    expect(states.at(-1)?.progress).toMatchObject({ processedItems: 14, complete: true });
    expect(states.at(-1)?.tracks).toHaveLength(10);
    expect(states.at(-1)?.audioFeatures).toHaveLength(10);
    expect(states[1].tracks).toHaveLength(7);
  });

  it('deduplicates across pages without counting a duplicate as a new match', () => {
    const states: TopTracksCollection[] = [];
    collector.collect('short_term', 3, 'statistics').subscribe((state) => states.push(state));
    pageRequest(3, 0).flush(batch(0, 3, 2, 8));
    const duplicate = batch(3, 1, 1, 8);
    duplicate.tracks[0].id = 'track-1';
    duplicate.audioFeatures[0].spotifyId = 'track-1';
    pageRequest(1, 3).flush(duplicate);
    pageRequest(1, 4).flush(batch(4, 1, 1, 8));

    expect(states.at(-1)?.tracks.map((track) => track.id)).toEqual([
      'track-0',
      'track-1',
      'track-4',
    ]);
    expect(states.at(-1)?.progress.skippedItems).toBe(2);
  });

  it('ends at the source boundary even when the target was not reached', () => {
    const states: TopTracksCollection[] = [];
    collector.collect('short_term', 10, 'statistics').subscribe((state) => states.push(state));
    pageRequest(10, 0).flush(batch(0, 10, 7, 13));
    pageRequest(3, 10).flush(batch(10, 3, 2, 13));
    expect(states.at(-1)?.progress).toMatchObject({
      foundTracks: 9,
      skippedItems: 4,
      complete: true,
      totalItems: 13,
    });
  });

  it('ends an empty library without another page', () => {
    const complete = vi.fn();
    collector.collect('short_term', 10, 'statistics').subscribe({ complete });
    pageRequest(10, 0).flush(batch(0, 0, 0, 0));
    expect(complete).toHaveBeenCalledOnce();
  });

  it('can examine more than forty positions when all measurements are missing', () => {
    const states: TopTracksCollection[] = [];
    collector.collect('short_term', 2, 'statistics').subscribe((state) => states.push(state));
    for (let offset = 0; offset < 50; offset += 2) {
      pageRequest(2, offset).flush(batch(offset, 2, 0, 50));
    }
    expect(states.at(-1)?.progress).toMatchObject({
      complete: true,
      foundTracks: 0,
      processedItems: 50,
      skippedItems: 50,
    });
  });

  it('does not extend collection indefinitely if the source total grows between pages', () => {
    const states: TopTracksCollection[] = [];
    collector.collect('short_term', 3, 'statistics').subscribe((state) => states.push(state));
    pageRequest(3, 0).flush(batch(0, 3, 0, 4));
    pageRequest(1, 3).flush(batch(3, 1, 0, 100));
    expect(states.at(-1)?.progress).toMatchObject({
      complete: true,
      foundTracks: 0,
      totalItems: 4,
      skippedItems: 4,
    });
  });

  it('passes the map completeness purpose without changing the time period', () => {
    collector.collect('long_term', 10, 'music-map').subscribe();
    const request = http.expectOne((request) => request.params.get('purpose') === 'music-map');
    expect(request.request.params.get('time_range')).toBe('long_term');
    expect(request.request.withCredentials).toBe(true);
    request.flush(batch(0, 1, 1, 1));
  });

  it.each([429, 502, 503, 504])(
    'stops on HTTP %s without retrying, skipping or requesting the next page',
    (status) => {
      const failure = vi.fn();
      const states: TopTracksCollection[] = [];
      collector
        .collect('short_term', 10, 'statistics')
        .subscribe({ next: (state) => states.push(state), error: failure });
      pageRequest(10, 0).flush(batch(0, 10, 7, 20));
      pageRequest(3, 10).flush(
        { error: { message: 'Unavailable' } },
        { status, statusText: 'Unavailable', headers: { 'Retry-After': '2' } }
      );
      expect(failure).toHaveBeenCalledOnce();
      expect(states.at(-1)?.progress).toMatchObject({
        foundTracks: 7,
        skippedItems: 3,
        complete: false,
      });
    }
  );

  it('cancels the pending request and does not send another batch after unsubscription', () => {
    const subscription = collector.collect('short_term', 10, 'statistics').subscribe();
    pageRequest(10, 0).flush(batch(0, 10, 7, 20));
    const pending = pageRequest(3, 10);
    subscription.unsubscribe();
    expect(pending.cancelled).toBe(true);
  });

  it('rejects a non-advancing response instead of looping', () => {
    const failure = vi.fn();
    collector.collect('short_term', 10, 'statistics').subscribe({ error: failure });
    pageRequest(10, 0).flush({ ...batch(0, 10, 7, 20), nextOffset: 0 });
    expect(failure).toHaveBeenCalledOnce();
  });

  it('does not start retrieval before subscription and does not share mutable collections', () => {
    const source = collector.collect('short_term', 10, 'statistics');
    http.expectNone('/api/me/top-tracks/dataset');
    const first: TopTracksCollection[] = [];
    const second: TopTracksCollection[] = [];
    source.subscribe((state) => first.push(state));
    source.subscribe((state) => second.push(state));
    const requests = http.match((request) => request.url === '/api/me/top-tracks/dataset');
    requests[0].flush(batch(0, 1, 1, 1));
    requests[1].flush(batch(0, 0, 0, 0));
    expect(first.at(-1)?.tracks).toHaveLength(1);
    expect(second.at(-1)?.tracks).toHaveLength(0);
  });

  function pageRequest(limit: number, offset: number) {
    return http.expectOne(
      (request) =>
        request.url === '/api/me/top-tracks/dataset' &&
        request.params.get('limit') === String(limit) &&
        request.params.get('offset') === String(offset) &&
        request.params.get('time_range') === 'short_term' &&
        request.params.get('purpose') === 'statistics'
    );
  }
});

function batch(offset: number, processed: number, found: number, total: number): TopTracksBatch {
  const tracks = Array.from({ length: found }, (_, index) => ({
    id: `track-${offset + index}`,
    name: `Track ${offset + index}`,
    artists: [{ name: 'Artist' }],
    album: { name: 'Album', images: [] },
    duration_ms: 1000,
    popularity: 10,
  }));
  return {
    tracks,
    audioFeatures: tracks.map((track) => ({ spotifyId: track.id, tempo: 120 })),
    processedItems: processed,
    skippedItems: processed - found,
    totalItems: total,
    nextOffset: offset + processed < total ? offset + processed : null,
  };
}
