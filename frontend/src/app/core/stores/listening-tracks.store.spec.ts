import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import { ListeningTracksStore } from './listening-tracks.store';
import type { TopTracksResponse } from '@core/api/spotify/spotify.models';
import type { AudioStats } from '@core/api/tracks/audio-features.models';

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
  });

  it('can load aggregate statistics without individual features', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(createTopTracks(['track-1'])));
    trackAnalysisApi.getAudioStats.mockReturnValue(of(createAudioStats()));

    store.load('long_term', 20, false);

    expect(trackAnalysisApi.getAudioStats).toHaveBeenCalledWith(['track-1']);
    expect(trackAnalysisApi.getAudioFeatures).not.toHaveBeenCalled();
    expect(store.audioFeatures()).toEqual([]);
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
    } finally {
      consoleError.mockRestore();
    }
  });
});

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
