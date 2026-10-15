import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { MusicMap } from './music-map';
import type { MusicMapDataset, MusicMapResponse } from './music-map.models';
import type { TopTracksBatch } from '@core/api/tracks/top-tracks.models';

describe('MusicMap collected dataset flow', () => {
  let fixture: ComponentFixture<MusicMap>;
  let http: HttpTestingController;
  let filters: AnalysisFiltersStore;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      imports: [MusicMap],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MusicMap);
    http = TestBed.inject(HttpTestingController);
    filters = TestBed.inject(AnalysisFiltersStore);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
    }
  });

  it('collects complete vectors before analysis and reuses the same dataset for cluster changes', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 10, 7, 20));
    fixture.detectChanges();
    expect(text()).toContain('Znaleziono 7/10');
    expect(text()).toContain('Szukam kolejnych 3');
    http.expectNone('/api/music-map/analysis');
    page(3, 10).flush(batch(10, 3, 2, 20));
    page(1, 13).flush(batch(13, 1, 1, 20));
    const analysis = http.expectOne('/api/music-map/analysis');
    const dataset: MusicMapDataset = analysis.request.body.dataset;
    expect(dataset.tracks).toHaveLength(10);
    expect(dataset.audioFeatures).toHaveLength(10);
    expect(
      Object.keys(
        dataset.audioFeatures[0].status === 'found' ? dataset.audioFeatures[0].features : {}
      )
    ).toHaveLength(11);
    expect(dataset.metadata).toMatchObject({
      requestedLimit: 10,
      timeRange: 'short_term',
      spotifyTotalTracksCount: 20,
    });
    analysis.flush(result(4));
    fixture.detectChanges();
    fixture.componentInstance.updateClusterCount(3);
    const reanalysis = http.expectOne('/api/music-map/analysis');
    expect(reanalysis.request.body).toEqual({ dataset, clusterCount: 3 });
    reanalysis.flush(result(3));
    expect(fixture.componentInstance.selectedClusterCount()).toBe(3);
    http.expectNone((request) => request.url === '/api/me/top-tracks/dataset');
    http.expectNone('/api/music-map/dataset');
  });

  it('cancels old source requests when the listening period changes', () => {
    fixture.detectChanges();
    const old = page(10, 0);
    filters.setTimeRange('long_term');
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    const current = page(10, 0);
    expect(current.request.params.get('time_range')).toBe('long_term');
    current.flush(batch(0, 0, 0, 0));
    expect(fixture.componentInstance.musicMap()).toBeNull();
  });

  it('does not analyze an exhausted source without complete measurements', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 8, 0, 8));
    fixture.detectChanges();
    expect(text()).toContain('Pominięto 8');
    expect(text()).toContain('Brak kompletnych pomiarów do mapy');
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.componentInstance.errorMessage()).toBeNull();
    http.expectNone('/api/music-map/analysis');
  });

  it('preserves an error after partial collection and retries from offset zero', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 10, 7, 20));
    page(3, 10).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain('Znaleziono 7/10');
    expect(text()).toContain('Pominięto 3');
    expect(text()).not.toContain('Szukam kolejnych');
    expect(fixture.componentInstance.dataset()).toBeNull();
    fixture.componentInstance.retryLoading();
    page(10, 0).flush(batch(0, 0, 0, 0));
  });

  it('retries failed analysis using cached measurements, without another collection', () => {
    fixture.detectChanges();
    page(10, 0).flush(batch(0, 4, 4, 4));
    const analysis = http.expectOne('/api/music-map/analysis');
    const body = analysis.request.body;
    analysis.flush({}, { status: 500, statusText: 'Unavailable' });
    fixture.componentInstance.retryLoading();
    const retry = http.expectOne('/api/music-map/analysis');
    expect(retry.request.body).toEqual(body);
    retry.flush(result(4));
    http.expectNone((request) => request.url === '/api/me/top-tracks/dataset');
  });

  it('cancels retrieval when leaving the view', () => {
    fixture.detectChanges();
    const pending = page(10, 0);
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
  });

  function page(limit: number, offset: number) {
    return http.expectOne(
      (request) =>
        request.url === '/api/me/top-tracks/dataset' &&
        request.params.get('purpose') === 'music-map' &&
        request.params.get('limit') === String(limit) &&
        request.params.get('offset') === String(offset)
    );
  }
  function text(): string {
    return fixture.nativeElement.textContent;
  }
});

function batch(offset: number, processed: number, found: number, total: number): TopTracksBatch {
  const tracks = Array.from({ length: found }, (_, index) => ({
    id: `track-${offset + index}`,
    name: 'Track',
    artists: [{ name: 'Artist' }],
    album: { name: 'Album', images: [] },
    duration_ms: 1000,
    popularity: 10,
  }));
  return {
    tracks,
    audioFeatures: tracks.map((track) => ({
      spotifyId: track.id,
      tempo: 120,
      acousticness: 0.2,
      danceability: 0.5,
      energy: 0.8,
      instrumentalness: 0,
      key: 1,
      liveness: 0.1,
      loudness: -5,
      mode: 1,
      speechiness: 0.1,
      valence: 0.7,
    })),
    processedItems: processed,
    skippedItems: processed - found,
    totalItems: total,
    nextOffset: offset + processed < total ? offset + processed : null,
  };
}
function result(selectedClusterCount: number): MusicMapResponse {
  return {
    source: 'spotify-top-tracks-reccobeats-audio-features',
    timeRange: 'short_term',
    requestedLimit: 10,
    spotifyReturnedTracksCount: 10,
    spotifyTotalTracksCount: 20,
    requestedClusterCount: selectedClusterCount,
    selectedClusterCount,
    selectedClusterCountSource: 'manual',
    appliedClusterCount: selectedClusterCount,
    candidateClusterResults: [],
    featureKeys: [],
    activeFeatureKeys: [],
    explainedVariance: [],
    tracksWithAudioFeaturesCount: 10,
    skippedTracksCount: 0,
    clusters: [],
    points: [],
    skippedTracks: [],
  };
}
