import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import { ListeningTracksStore } from './listening-tracks.store';
import type { TopTracksResponse } from '@core/api/spotify/spotify.models';
import type { AudioStats, TrackAnalysisResponse } from '@core/api/tracks/audio-features.models';

describe('ListeningTracksStore', () => {
  const spotifyApi = { getTopTracks: vi.fn() };
  const trackAnalysisApi = {
    getAudioStats: vi.fn(),
    getAudioFeatures: vi.fn(),
    getTracksAnalysis: vi.fn(),
  };
  let store: ListeningTracksStore;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ListeningTracksStore,
        { provide: SpotifyApiService, useValue: spotifyApi },
        { provide: TrackAnalysisApiService, useValue: trackAnalysisApi },
      ],
    });
    store = TestBed.inject(ListeningTracksStore);
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads tracks, statistics and individual audio features', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(
      of({
        stats: createAudioStats(),
        audioFeatures: [{ spotifyId: 'track-1', tempo: 120 }],
      })
    );

    store.load('short_term', 10);

    expect(store.topTracks()?.items[0].id).toBe('track-1');
    expect(store.audioStats()?.averageBpm).toBe(120);
    expect(store.audioFeatures()).toEqual([{ spotifyId: 'track-1', tempo: 120 }]);
    expect(store.isAudioStatsLoading()).toBe(false);
    expect(store.loadState()).toBe('ready');
    expect(store.feedbackMessage()).toBeNull();
    expect(store.hasError()).toBe(false);
    expect(trackAnalysisApi.getTracksAnalysis).toHaveBeenCalledOnce();
    expect(trackAnalysisApi.getTracksAnalysis).toHaveBeenCalledWith(['track-1']);
    expect(trackAnalysisApi.getAudioStats).not.toHaveBeenCalled();
    expect(trackAnalysisApi.getAudioFeatures).not.toHaveBeenCalled();
  });

  it('does not call analysis endpoints for an empty Spotify result', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks([])));

    store.load('medium_term', 10);

    expect(trackAnalysisApi.getAudioStats).not.toHaveBeenCalled();
    expect(trackAnalysisApi.getAudioFeatures).not.toHaveBeenCalled();
    expect(trackAnalysisApi.getTracksAnalysis).not.toHaveBeenCalled();
    expect(store.audioStats()).toBeNull();
    expect(store.isAudioStatsLoading()).toBe(false);
    expect(store.loadState()).toBe('no-tracks');
    expect(store.feedbackMessage()).toContain('Brak utworów');
    expect(store.hasError()).toBe(false);
  });

  it('can load aggregate statistics without individual features', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1'])));
    trackAnalysisApi.getAudioStats.mockReturnValue(of(createAudioStats()));

    store.load('long_term', 20, false);

    expect(trackAnalysisApi.getAudioStats).toHaveBeenCalledWith(['track-1']);
    expect(trackAnalysisApi.getAudioFeatures).not.toHaveBeenCalled();
    expect(store.audioFeatures()).toEqual([]);
    expect(store.loadState()).toBe('ready');
  });

  it('clears analysis data after a loading failure', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    spotifyApi.getTopTracks.mockReturnValue(throwError(() => new Error('Spotify unavailable')));

    try {
      store.load('short_term', 10);

      expect(store.topTracks()).toBeNull();
      expect(store.audioStats()).toBeNull();
      expect(store.audioFeatures()).toEqual([]);
      expect(store.isAudioStatsLoading()).toBe(false);
      expect(store.loadState()).toBe('tracks-error');
      expect(store.hasError()).toBe(true);
      expect(store.feedbackMessage()).toContain('Nie udało się pobrać najczęściej');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps Spotify tracks and reports an analysis failure separately', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tracks = createTopTracks(['track-1']);
    spotifyApi.getTopTracks.mockReturnValue(of(tracks));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(throwError(() => new Error('Unavailable')));

    store.load('short_term', 10);

    expect(store.topTracks()).toEqual(tracks);
    expect(store.audioStats()).toBeNull();
    expect(store.audioFeatures()).toEqual([]);
    expect(store.loadState()).toBe('audio-error');
    expect(store.hasError()).toBe(true);
    expect(store.feedbackMessage()).toContain('cech audio i statystyk');
    expect(store.isAudioStatsLoading()).toBe(false);
  });

  it('reports unavailable measurements without treating a successful response as an error', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(
      of({
        stats: createEmptyAudioStats(),
        audioFeatures: [{ spotifyId: 'track-1', error: 'Not found' }],
      })
    );

    store.load('short_term', 10);

    expect(store.loadState()).toBe('no-audio-features');
    expect(store.hasError()).toBe(false);
    expect(store.feedbackMessage()).toContain('Nie znaleziono pomiarów');
    expect(store.topTracks()?.items).toHaveLength(1);
  });

  it('reports no measurements even when an audio record was found but all features are null', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(
      of({
        stats: { ...createEmptyAudioStats(), trackCount: 1, foundTracksCount: 1 },
        audioFeatures: [{ spotifyId: 'track-1', tempo: null }],
      })
    );

    store.load('short_term', 10);

    expect(store.loadState()).toBe('no-audio-features');
  });

  it('accepts zero-valued measurements and partially missing audio data', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1', 'track-2'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(
      of({
        stats: { ...createEmptyAudioStats(), averageEnergy: 0, foundTracksCount: 1 },
        audioFeatures: [
          { spotifyId: 'track-1', energy: 0 },
          { spotifyId: 'track-2', error: 'Not found' },
        ],
      })
    );

    store.load('short_term', 10);

    expect(store.loadState()).toBe('ready');
    expect(store.tracksFoundRatio()?.audioDataTracksCount).toBe(1);
  });

  it('clears previous data and errors as soon as a new load starts', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    spotifyApi.getTopTracks.mockReturnValueOnce(throwError(() => new Error('Unavailable')));
    store.load('short_term', 10);
    spotifyApi.getTopTracks.mockReturnValueOnce(new Subject<TopTracksResponse>());

    const subscription = store.load('long_term', 20);

    expect(store.loadState()).toBe('loading');
    expect(store.hasError()).toBe(false);
    expect(store.feedbackMessage()).toBeNull();
    expect(store.topTracks()).toBeNull();
    expect(store.audioStats()).toBeNull();
    expect(store.audioFeatures()).toEqual([]);
    subscription.unsubscribe();
  });

  it('does not apply analysis from an unsubscribed request after filters change', () => {
    const previousAnalysis = new Subject<TrackAnalysisResponse>();
    spotifyApi.getTopTracks.mockReturnValueOnce(of(createTopTracks(['old-track'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValueOnce(previousAnalysis);
    const previousSubscription = store.load('short_term', 10);
    previousSubscription.unsubscribe();
    spotifyApi.getTopTracks.mockReturnValueOnce(of(createTopTracks([])));
    store.load('long_term', 20);

    previousAnalysis.next({ stats: createAudioStats(), audioFeatures: [] });

    expect(store.loadState()).toBe('no-tracks');
    expect(store.audioStats()).toBeNull();
  });

  it('requests a reload without starting an unmanaged subscription', () => {
    const initialVersion = store.reloadVersion();

    store.retry();

    expect(store.reloadVersion()).toBe(initialVersion + 1);
    expect(spotifyApi.getTopTracks).not.toHaveBeenCalled();
  });
});

function createEmptyAudioStats(): AudioStats {
  return {
    ...createAudioStats(),
    trackCount: 0,
    foundTracksCount: 0,
    averageBpm: null,
    averageEnergy: null,
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

function createTopTracks(trackIds: string[]): TopTracksResponse {
  return {
    href: '',
    items: trackIds.map((id) => ({
      id,
      name: `Track ${id}`,
      artists: [{ name: 'Artist' }],
      album: { name: 'Album', images: [] },
      duration_ms: 180_000,
      popularity: 50,
    })),
    limit: 10,
    next: null,
    offset: 0,
    previous: null,
    total: trackIds.length,
  };
}

function createAudioStats(): AudioStats {
  return {
    trackCount: 1,
    averageBpm: 120,
    averageEnergy: 0.8,
    averageDanceability: 0.7,
    averageValence: 0.6,
    averageAcousticness: 0.2,
    averageInstrumentalness: 0.1,
    averageLiveness: 0.15,
    averageSpeechiness: 0.05,
    averageLoudness: -5,
    dominantKey: 2,
    dominantMode: 1,
    majorPercentage: 100,
    minorPercentage: 0,
    dominantTimeSignature: 4,
    liveTrackPercentage: 0,
    instrumentalTrackPercentage: 0,
    speechHeavyTrackPercentage: 0,
    measurementCounts: { mode: 1, liveness: 1, instrumentalness: 1, speechiness: 1 },
    foundTracksCount: 1,
    totalTracksCount: 1,
  };
}
