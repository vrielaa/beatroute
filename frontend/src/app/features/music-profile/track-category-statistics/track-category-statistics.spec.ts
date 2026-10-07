import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TrackCategoryStatistics } from './track-category-statistics';
import type { AudioStats } from '@core/api/tracks/audio-features.models';

describe('TrackCategoryStatistics', () => {
  let fixture: ComponentFixture<TrackCategoryStatistics>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackCategoryStatistics],
    }).compileComponents();
    fixture = TestBed.createComponent(TrackCategoryStatistics);
  });

  it('shows percentages with the number of available measurements among requested tracks', () => {
    fixture.componentRef.setInput(
      'audioStats',
      createStats({
        liveTrackPercentage: 100,
        instrumentalTrackPercentage: null,
        speechHeavyTrackPercentage: 0,
        measurementCounts: { mode: 2, liveness: 1, instrumentalness: 0, speechiness: 2 },
      })
    );
    fixture.detectChanges();

    const live = getStatistic('Nagrania na żywo');
    expect(live).toContain('100%');
    expect(live).toContain('Pomiary: 1 z 3 utworów.');
    expect(live).toContain('Brak pomiaru: 2.');
    const instrumental = getStatistic('Utwory instrumentalne');
    expect(instrumental).toContain('Brak danych');
    expect(instrumental).not.toContain('0%');
    expect(instrumental).toContain('Pomiary: 0 z 3 utworów.');
    const speech = getStatistic('Utwory z wysokim udziałem mowy');
    expect(speech).toContain('0%');
    expect(speech).not.toContain('Brak danych');
    expect(speech).toContain('Pomiary: 2 z 3 utworów.');
  });

  it('shows missing data for every percentage when there are no measurements', () => {
    fixture.componentRef.setInput(
      'audioStats',
      createStats({
        liveTrackPercentage: null,
        instrumentalTrackPercentage: null,
        speechHeavyTrackPercentage: null,
        majorPercentage: null,
        minorPercentage: null,
        measurementCounts: { mode: 0, liveness: 0, instrumentalness: 0, speechiness: 0 },
      })
    );
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const values = Array.from(element.querySelectorAll('.track-category-value'));
    expect(values).toHaveLength(5);
    expect(values.every((value) => value.textContent?.trim() === 'Brak danych')).toBe(true);
    expect(element.textContent).not.toContain('0%');
    expect(getStatistic('Utwory durowe')).toContain('Pomiary: 0 z 3 utworów.');
  });

  it('replaces the previous percentages and coverage when the data changes', () => {
    fixture.componentRef.setInput('audioStats', createStats());
    fixture.detectChanges();
    expect(getStatistic('Nagrania na żywo')).toContain('0%');

    fixture.componentRef.setInput(
      'audioStats',
      createStats({
        liveTrackPercentage: 100,
        totalTracksCount: 5,
        measurementCounts: { mode: 2, liveness: 1, instrumentalness: 2, speechiness: 2 },
      })
    );
    fixture.detectChanges();

    const live = getStatistic('Nagrania na żywo');
    expect(live).toContain('100%');
    expect(live).toContain('Pomiary: 1 z 5 utworów.');
    expect(live).toContain('Brak pomiaru: 4.');
  });

  it('shows an empty state when no statistics are available', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Brak danych o typach utworów.');
    expect(fixture.nativeElement.querySelector('.track-category-list')).toBeNull();
  });

  it('hides previous percentages while the next dataset is loading', () => {
    fixture.componentRef.setInput('audioStats', createStats());
    fixture.componentRef.setInput('isLoading', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ładowanie statystyk utworów');
    expect(fixture.nativeElement.querySelector('.track-category-list')).toBeNull();
  });

  function getStatistic(label: string): string {
    const element: HTMLElement = fixture.nativeElement;
    const item = Array.from(element.querySelectorAll('.track-category-item')).find(
      (item) => item.querySelector('dt')?.textContent?.trim() === label
    );
    expect(item).toBeDefined();
    return (item?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
});

function createStats(overrides: Partial<AudioStats> = {}): AudioStats {
  return {
    trackCount: 2,
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
    dominantTimeSignature: 4,
    majorPercentage: 100,
    minorPercentage: 0,
    liveTrackPercentage: 0,
    instrumentalTrackPercentage: 0,
    speechHeavyTrackPercentage: 0,
    measurementCounts: { mode: 2, liveness: 2, instrumentalness: 2, speechiness: 2 },
    foundTracksCount: 2,
    totalTracksCount: 3,
    ...overrides,
  };
}
