import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListeningTracksStore } from './listening-tracks.store';
import { TopTracksCollector } from './top-tracks-collector.service';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import type { TopTracksCollection } from '@core/api/tracks/top-tracks.models';
import type { AudioStats } from '@core/api/tracks/audio-features.models';

describe('ListeningTracksStore', () => {
  const collector = { collect: vi.fn() };
  const api = { getStatistics: vi.fn(), getTracksAnalysis: vi.fn() };
  let store: ListeningTracksStore;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      providers: [
        ListeningTracksStore,
        { provide: TopTracksCollector, useValue: collector },
        { provide: TrackAnalysisApiService, useValue: api },
      ],
    });
    store = TestBed.inject(ListeningTracksStore);
  });
  afterEach(() => vi.restoreAllMocks());

  it('updates batch progress and summarizes only the completed combined dataset', () => {
    const source = new Subject<TopTracksCollection>();
    collector.collect.mockReturnValue(source);
    api.getStatistics.mockReturnValue(of(stats()));
    store.load('short_term', 10);
    source.next(collection(['one'], false, 3));
    expect(store.progress()?.skippedItems).toBe(2);
    expect(api.getStatistics).not.toHaveBeenCalled();
    source.next(collection(['one', 'two'], true, 4));
    expect(api.getStatistics).toHaveBeenCalledExactlyOnceWith([
      { spotifyId: 'one', tempo: 120 },
      { spotifyId: 'two', tempo: 120 },
    ]);
    expect(api.getTracksAnalysis).not.toHaveBeenCalled();
    expect(store.topTracks()?.items).toHaveLength(2);
    expect(store.loadState()).toBe('ready');
    expect(store.averageBpm()).toBe(120);
    expect(collector.collect).toHaveBeenCalledWith('short_term', 10, 'statistics');
  });

  it('distinguishes an empty source from missing measurements', () => {
    collector.collect.mockReturnValueOnce(of(collection([], true, 0, 0)));
    store.load('short_term', 10);
    expect(store.loadState()).toBe('no-tracks');
    collector.collect.mockReturnValueOnce(of(collection([], true, 10, 10)));
    store.load('short_term', 10);
    expect(store.loadState()).toBe('no-audio-features');
    expect(store.hasError()).toBe(false);
    expect(api.getStatistics).not.toHaveBeenCalled();
  });

  it('treats a batch failure as an error without adding missing tracks', () => {
    const source = new Subject<TopTracksCollection>();
    collector.collect.mockReturnValue(source);
    store.load('short_term', 10);
    source.next(collection(['one'], false, 3));
    source.error(
      new HttpErrorResponse({
        status: 429,
        error: { error: { details: { integration: 'reccobeats' } } },
      })
    );
    expect(store.loadState()).toBe('audio-error');
    expect(store.progress()?.skippedItems).toBe(2);
    expect(store.progress()?.complete).toBe(false);
    expect(store.topTracks()?.items).toHaveLength(1);
    expect(api.getStatistics).not.toHaveBeenCalled();
  });

  it('reports a Spotify failure separately', () => {
    collector.collect.mockReturnValue(throwError(() => new Error('Spotify unavailable')));
    store.load('short_term', 10);
    expect(store.loadState()).toBe('tracks-error');
    expect(store.topTracks()).toBeNull();
    expect(store.hasError()).toBe(true);
  });

  it('does not publish partial statistics after a summary failure', () => {
    collector.collect.mockReturnValue(of(collection(['one'], true, 1)));
    api.getStatistics.mockReturnValue(throwError(() => new Error('Unavailable')));
    store.load('short_term', 10);
    expect(store.loadState()).toBe('audio-error');
    expect(store.topTracks()?.items).toHaveLength(1);
    expect(store.audioStats()).toBeNull();
    expect(store.audioFeatures()).toEqual([]);
  });

  it('does not apply cancelled statistics responses after filters change', () => {
    const pending = new Subject<AudioStats>();
    collector.collect.mockReturnValueOnce(of(collection(['old'], true, 1)));
    api.getStatistics.mockReturnValueOnce(pending);
    const previous = store.load('short_term', 10);
    previous.unsubscribe();
    collector.collect.mockReturnValueOnce(of(collection([], true, 0, 0)));
    store.load('long_term', 20);
    pending.next(stats());
    expect(store.loadState()).toBe('no-tracks');
    expect(store.audioStats()).toBeNull();
  });

  it('resets previous data and requests an explicit reload without subscribing on its own', () => {
    collector.collect.mockReturnValueOnce(of(collection([], true, 0, 0)));
    store.load('short_term', 10);
    collector.collect.mockReturnValueOnce(new Subject<TopTracksCollection>());
    const subscription = store.load('long_term', 20);
    expect(store.progress()).toBeNull();
    expect(store.topTracks()).toBeNull();
    expect(store.loadState()).toBe('loading');
    const version = store.reloadVersion();
    store.retry();
    expect(store.reloadVersion()).toBe(version + 1);
    expect(collector.collect).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });
});

function collection(
  ids: string[],
  complete: boolean,
  processed: number,
  total = 20
): TopTracksCollection {
  return {
    tracks: ids.map((id) => ({
      id,
      name: `Track ${id}`,
      artists: [{ name: 'Artist' }],
      album: { name: 'Album', images: [] },
      duration_ms: 1000,
      popularity: 10,
    })),
    audioFeatures: ids.map((spotifyId) => ({ spotifyId, tempo: 120 })),
    nextOffset: complete ? null : processed,
    progress: {
      requestedTracks: 10,
      foundTracks: ids.length,
      skippedItems: processed - ids.length,
      processedItems: processed,
      totalItems: total,
      complete,
    },
  };
}

function stats(): AudioStats {
  return {
    trackCount: 2,
    foundTracksCount: 2,
    totalTracksCount: 2,
    averageBpm: 120,
    averageEnergy: 0,
    averageDanceability: null,
    averageValence: null,
    averageAcousticness: null,
    averageInstrumentalness: null,
    averageLiveness: null,
    averageSpeechiness: null,
    averageLoudness: null,
    dominantKey: null,
    dominantMode: null,
    dominantTimeSignature: null,
    majorPercentage: null,
    minorPercentage: null,
    liveTrackPercentage: null,
    instrumentalTrackPercentage: null,
    speechHeavyTrackPercentage: null,
    measurementCounts: { mode: 0, liveness: 0, instrumentalness: 0, speechiness: 0 },
  };
}
