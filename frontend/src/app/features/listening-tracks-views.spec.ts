import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, Subscription, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';
import type { TopTracksResponse } from '@core/api/spotify/spotify.models';
import type { AudioStats } from '@core/api/tracks/audio-features.models';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { ListeningTracksStore } from '@core/stores/listening-tracks.store';
import { DashboardArtistsStore } from './dashboard/dashboard/dashboard-artists.store';
import { Dashboard } from './dashboard/dashboard/dashboard';
import { MusicProfile } from './music-profile/music-profile';

describe.each([Dashboard, MusicProfile])('%s listening tracks feedback', (view) => {
  const spotifyApi = { getTopTracks: vi.fn() };
  const trackAnalysisApi = { getTracksAnalysis: vi.fn() };
  let fixture: ComponentFixture<Dashboard | MusicProfile>;
  let filters: AnalysisFiltersStore;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      imports: [view],
      providers: [
        { provide: SpotifyApiService, useValue: spotifyApi },
        { provide: TrackAnalysisApiService, useValue: trackAnalysisApi },
      ],
    });
    if (view === Dashboard) {
      TestBed.overrideComponent(Dashboard, {
        set: {
          providers: [
            ListeningTracksStore,
            {
              provide: DashboardArtistsStore,
              useValue: {
                topArtists: signal(null),
                isTopArtistsLoading: signal(false),
                hasTopArtistsError: signal(false),
                genreDistribution: signal(null),
                isGenreDistributionLoading: signal(false),
                hasGenreDistributionError: signal(false),
                artistsFoundRatio: signal(null),
                artistGenres: signal({}),
                reloadVersion: signal(0),
                load: () => new Subscription(),
              },
            },
          ],
        },
      });
    }
    await TestBed.compileComponents();
    fixture = TestBed.createComponent<Dashboard | MusicProfile>(view);
    filters = TestBed.inject(AnalysisFiltersStore);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows an error and retries using the current filters, then removes the error', () => {
    spotifyApi.getTopTracks.mockReturnValue(throwError(() => new Error('Unavailable')));
    fixture.detectChanges();
    expect(feedback()?.getAttribute('role')).toBe('alert');
    expect(feedback()?.textContent).toContain('Nie udało się pobrać najczęściej');
    expect(element().querySelector('app-most-listened-tracks')).toBeNull();

    filters.setTimeRange('long_term');
    filters.setTracksRange(20);
    fixture.detectChanges();
    spotifyApi.getTopTracks.mockReturnValue(of(topTracks([])));
    const button = feedback()?.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    fixture.detectChanges();

    expect(spotifyApi.getTopTracks).toHaveBeenLastCalledWith('long_term', 20);
    expect(spotifyApi.getTopTracks).toHaveBeenCalledTimes(3);
    expect(feedback()?.getAttribute('role')).toBe('status');
    expect(feedback()?.textContent).toContain('Brak utworów');
    expect(feedback()?.querySelector('button')).toBeNull();
  });

  it('shows a successful empty Spotify result without an error or retry button', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(topTracks([])));
    fixture.detectChanges();

    expect(feedback()?.textContent).toContain('Brak utworów');
    expect(feedback()?.getAttribute('role')).toBe('status');
    expect(feedback()?.querySelector('button')).toBeNull();
    expect(element().querySelector('app-average-bpm')).toBeNull();
    expect(trackAnalysisApi.getTracksAnalysis).not.toHaveBeenCalled();
  });

  it('distinguishes missing measurements from failed analysis', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(topTracks(['track-1'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValue(
      of({ stats: emptyStats(), audioFeatures: [] })
    );
    fixture.detectChanges();

    expect(feedback()?.textContent).toContain('Nie znaleziono pomiarów');
    expect(feedback()?.getAttribute('role')).toBe('status');
    expect(feedback()?.querySelector('button')).toBeNull();
    expect(element().querySelector('app-average-bpm')).toBeNull();
    if (view === Dashboard) {
      expect(element().querySelector('app-most-listened-tracks')?.textContent).toContain(
        'Track track-1'
      );
    }

    trackAnalysisApi.getTracksAnalysis.mockReturnValue(throwError(() => new Error('Unavailable')));
    filters.setTracksRange(20);
    fixture.detectChanges();

    expect(feedback()?.textContent).toContain('Nie udało się pobrać cech audio');
    expect(feedback()?.getAttribute('role')).toBe('alert');
    expect(feedback()?.querySelector('button')).not.toBeNull();
    if (view === Dashboard) {
      expect(element().querySelector('app-most-listened-tracks')?.textContent).toContain(
        'Track track-1'
      );
    }
  });

  it('hides previous feedback while loading and ignores cancelled requests', () => {
    const previousRequest = new Subject<TopTracksResponse>();
    spotifyApi.getTopTracks.mockReturnValueOnce(of(topTracks([])));
    fixture.detectChanges();
    spotifyApi.getTopTracks.mockReturnValueOnce(previousRequest);
    filters.setTracksRange(20);
    fixture.detectChanges();
    expect(feedback()).toBeNull();
    spotifyApi.getTopTracks.mockReturnValueOnce(of(topTracks([])));
    filters.setTimeRange('long_term');
    fixture.detectChanges();

    previousRequest.error(new Error('Outdated failure'));
    fixture.detectChanges();

    expect(feedback()?.getAttribute('role')).toBe('status');
    expect(feedback()?.textContent).toContain('Brak utworów');
  });

  it('shows analysis cards again after a successful retry', () => {
    spotifyApi.getTopTracks.mockReturnValue(of(topTracks(['track-1'])));
    trackAnalysisApi.getTracksAnalysis.mockReturnValueOnce(
      throwError(() => new Error('Unavailable'))
    );
    fixture.detectChanges();
    trackAnalysisApi.getTracksAnalysis.mockReturnValueOnce(
      of({
        stats: { ...emptyStats(), averageBpm: 120, foundTracksCount: 1, trackCount: 1 },
        audioFeatures: [{ spotifyId: 'track-1', tempo: 120 }],
      })
    );

    feedback()?.querySelector('button')?.click();
    fixture.detectChanges();

    expect(feedback()).toBeNull();
    expect(trackAnalysisApi.getTracksAnalysis).toHaveBeenCalledTimes(2);
    if (view === MusicProfile) {
      expect(element().querySelector('app-average-bpm')?.textContent).toContain('120');
    }
  });

  function element(): HTMLElement {
    return fixture.nativeElement;
  }

  function feedback(): HTMLElement | null {
    return element().querySelector('app-listening-tracks-feedback section');
  }
});

function topTracks(ids: string[]): TopTracksResponse {
  return {
    href: '',
    limit: 10,
    next: null,
    offset: 0,
    previous: null,
    total: ids.length,
    items: ids.map((id) => ({
      id,
      name: `Track ${id}`,
      artists: [{ name: 'Artist' }],
      album: { name: 'Album', images: [] },
      duration_ms: 180000,
      popularity: 50,
    })),
  };
}

function emptyStats(): AudioStats {
  return {
    trackCount: 0,
    totalTracksCount: 1,
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
