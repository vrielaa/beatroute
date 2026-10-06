import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { MusicMapApiService } from './music-map-api.service';
import { MusicMap } from './music-map';
import type { MusicMapDataset, MusicMapResponse } from './music-map.models';

describe('MusicMap', () => {
  const dataset = createDataset();
  const analysisFiltersStore = {
    selectedTimeRange: signal<'short_term' | 'medium_term' | 'long_term'>('long_term'),
    selectedTracksRange: signal(40),
  };
  const musicMapApi = {
    getMusicMapDataset: vi.fn(),
    analyzeMusicMap: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    musicMapApi.getMusicMapDataset.mockReturnValue(of(dataset));
    musicMapApi.analyzeMusicMap.mockReturnValue(of(createMusicMapResponse(4)));

    TestBed.configureTestingModule({
      imports: [MusicMap],
      providers: [
        { provide: AnalysisFiltersStore, useValue: analysisFiltersStore },
        { provide: MusicMapApiService, useValue: musicMapApi },
      ],
    });
  });

  it('reuses the loaded dataset when the cluster count changes', () => {
    const fixture = TestBed.createComponent(MusicMap);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(musicMapApi.getMusicMapDataset).toHaveBeenCalledOnce();
    expect(musicMapApi.analyzeMusicMap).toHaveBeenCalledWith(dataset, 4);

    musicMapApi.analyzeMusicMap.mockReturnValue(of(createMusicMapResponse(3)));
    component.updateClusterCount(3);

    expect(musicMapApi.getMusicMapDataset).toHaveBeenCalledOnce();
    expect(musicMapApi.analyzeMusicMap).toHaveBeenCalledTimes(2);
    expect(musicMapApi.analyzeMusicMap).toHaveBeenLastCalledWith(dataset, 3);
    expect(component.selectedClusterCount()).toBe(3);
  });
});

function createDataset(): MusicMapDataset {
  return {
    tracks: [],
    audioFeatures: [],
    metadata: {
      timeRange: 'long_term',
      requestedLimit: 40,
      spotifyReturnedTracksCount: 0,
      spotifyTotalTracksCount: 0,
    },
  };
}

function createMusicMapResponse(selectedClusterCount: number): MusicMapResponse {
  return {
    source: 'spotify-top-tracks-reccobeats-audio-features',
    timeRange: 'long_term',
    requestedLimit: 40,
    spotifyReturnedTracksCount: 4,
    spotifyTotalTracksCount: 4,
    requestedClusterCount: selectedClusterCount,
    selectedClusterCount,
    selectedClusterCountSource: 'manual',
    appliedClusterCount: selectedClusterCount,
    candidateClusterResults: [],
    featureKeys: [],
    activeFeatureKeys: [],
    explainedVariance: [],
    tracksWithAudioFeaturesCount: 4,
    skippedTracksCount: 0,
    clusters: [],
    points: [],
    skippedTracks: [],
  };
}
