import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { ListeningTracksStore } from '@core/stores/listening-tracks.store';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import type { TopTracksBatch } from '@core/api/tracks/top-tracks.models';
import { DashboardArtistsStore } from './dashboard/dashboard/dashboard-artists.store';
import { Dashboard } from './dashboard/dashboard/dashboard';
import { MusicProfile } from './music-profile/music-profile';

describe.each([Dashboard, MusicProfile])('%s top-track collection flow', (view) => {
  let fixture: ComponentFixture<Dashboard | MusicProfile>;
  let filters: AnalysisFiltersStore;
  let http: HttpTestingController;
  let artistsFoundRatio = signal<{
    requestedArtistsCount: number;
    spotifyTotalArtistsCount: number;
  } | null>(null);

  beforeEach(async () => {
    artistsFoundRatio = signal(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      imports: [view],
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
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
                artistsFoundRatio,
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
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows real 7/10 → 9/10 → 10/10 progress and summarizes the combined measurements only once', () => {
    if (view === Dashboard) {
      artistsFoundRatio.set({ requestedArtistsCount: 10, spotifyTotalArtistsCount: 9 });
    }
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 10, 7, 20));
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Znaleziono 7/10');
    expect(feedback()?.textContent).toContain('Pominięto 3');
    expect(feedback()?.textContent).toContain('Szukam kolejnych 3');
    http.expectNone('/api/tracks/statistics');
    page(3, 10).flush(batch(10, 3, 2, 20));
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Znaleziono 9/10');
    expect(feedback()?.textContent).toContain('Pominięto 4');
    expect(feedback()?.textContent).toContain('Szukam kolejnych 1');
    page(1, 13).flush(batch(13, 1, 1, 20));
    const summary = http.expectOne('/api/tracks/statistics');
    expect(summary.request.body.audioFeatures).toHaveLength(10);
    expect(summary.request.method).toBe('POST');
    summary.flush({
      averageBpm: 120,
      foundTracksCount: 10,
      trackCount: 10,
      totalTracksCount: 10,
      measurementCounts: { mode: 0, liveness: 0, instrumentalness: 0, speechiness: 0 },
    });
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Znaleziono 10/10');
    expect(feedback()?.textContent).toContain('Utwory z pomiarami.');
    expect(feedback()?.textContent).toContain('Sprawdzono 14.');
    expect(feedback()?.textContent).toContain('Pominięto 4.');
    expect(feedback()?.textContent).not.toContain('Szukam kolejnych');
    if (view === Dashboard) {
      const warning = element().querySelector('app-listening-stats-warnings');
      expect(warning?.textContent).toContain('10 artystów');
      expect(warning?.textContent).toContain('9 najczęściej słuchanych artystów');
      expect(feedback()?.textContent).not.toContain('artystów');
    }
    if (view === MusicProfile)
      expect(element().querySelector('app-average-bpm')?.textContent).toContain('120');
    http.expectNone('/api/tracks/analysis');
  });

  it('distinguishes an empty source from a source without measurements', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 0, 0, 0));
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Brak utworów');
    expect(feedback()?.querySelector('button')).toBeNull();
    filters.setTracksRange(20);
    fixture.detectChanges();
    page(20, 0).flush(batch(0, 10, 0, 10));
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Nie znaleziono pomiarów');
    expect(feedback()?.textContent).toContain('Pominięto 10');
    expect(feedback()?.getAttribute('role')).toBe('status');
    http.expectNone('/api/tracks/statistics');
  });

  it('shows source exhaustion rather than claiming the requested number was found', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 8, 7, 8));
    http.expectOne('/api/tracks/statistics').flush({ averageBpm: 120, measurementCounts: {} });
    fixture.detectChanges();
    expect(feedback()?.textContent).toContain('Znaleziono 7/10');
    expect(feedback()?.textContent).toContain('Koniec wyników dla tego okresu');
  });

  it('stops a partially collected dataset on rate limiting without inventing skipped positions', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 10, 7, 20));
    page(3, 10).flush(
      { error: { details: { integration: 'reccobeats' } } },
      { status: 429, statusText: 'Rate limited', headers: { 'Retry-After': '2' } }
    );
    fixture.detectChanges();
    expect(feedback()?.getAttribute('role')).toBe('alert');
    expect(feedback()?.textContent).toContain('Znaleziono 7/10');
    expect(feedback()?.textContent).toContain('Pominięto 3');
    expect(feedback()?.textContent).not.toContain('Szukam kolejnych');
    expect(feedback()?.querySelector('button')).not.toBeNull();
    http.expectNone('/api/tracks/statistics');
  });

  it('cancels old pages on filter changes and retries explicitly from the start of the current period', () => {
    fixture.detectChanges();
    const old = page(10, 0);
    filters.setTimeRange('long_term');
    filters.setTracksRange(20);
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    page(20, 0).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    feedback()?.querySelector('button')?.click();
    fixture.detectChanges();
    const retried = page(20, 0);
    expect(retried.request.params.get('time_range')).toBe('long_term');
    retried.flush(batch(0, 0, 0, 0));
  });

  function page(limit: number, offset: number) {
    return http.expectOne(
      (request) =>
        request.url === '/api/me/top-tracks/dataset' &&
        request.params.get('limit') === String(limit) &&
        request.params.get('offset') === String(offset)
    );
  }
  function element(): HTMLElement {
    return fixture.nativeElement;
  }
  function feedback(): HTMLElement | null {
    return element().querySelector('app-listening-tracks-feedback section');
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
