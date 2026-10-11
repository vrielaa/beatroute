import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  PlaylistFeatureMatch,
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
} from '../../playlist-generator.models';
import { PlaylistPreferenceMatches } from './playlist-preference-matches';

describe('PlaylistPreferenceMatches', () => {
  let fixture: ComponentFixture<PlaylistPreferenceMatches>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistPreferenceMatches],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistPreferenceMatches);
  });

  it('distinguishes no active preferences from unavailable measurements', () => {
    renderMatches([]);

    expect(getText()).toContain('Nie wybrano aktywnych preferencji.');
    expect(getRows()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.measurement-summary')).toBeNull();
    expect(getText()).not.toContain('Brak pomiaru');
    expect(getText()).not.toContain('0%');
  });

  it.each<{ feature: PlaylistPreferenceFeature; label: string }>([
    { feature: 'energy', label: 'Energia' },
    { feature: 'danceability', label: 'Taneczność' },
    { feature: 'valence', label: 'Pozytywność brzmienia (walencja)' },
    { feature: 'acousticness', label: 'Akustyczność' },
    { feature: 'instrumentalness', label: 'Instrumentalność' },
  ])('displays the Polish label for $feature', ({ feature, label }) => {
    renderMatches([createFeatureMatch({ feature })]);

    expect(getRows()).toHaveLength(1);
    expect(getCell(getRows()[0], '.preference-name')).toBe(label);
  });

  it.each<{ level: PlaylistPreferenceLevel; label: string }>([
    { level: 'low', label: 'Niski' },
    { level: 'medium', label: 'Średni' },
    { level: 'high', label: 'Wysoki' },
  ])('displays the selected $level level', ({ level, label }) => {
    renderMatches([createFeatureMatch({ level })]);

    expect(getCell(getRows()[0], '.preference-level')).toBe(label);
  });

  it('shows the raw measurement separately from a zero preference match', () => {
    renderMatches([createFeatureMatch({ level: 'low', measurement: 0.801, match: 0 })]);

    const row = getRows()[0];
    expect(getCell(row, '.preference-measurement')).toBe('0.801');
    expect(getCell(row, '.preference-score')).toBe('0%');
    expect(getText()).toContain('Pomiary dostępne dla 1 z 1 aktywnych preferencji.');
    expect(getText()).not.toContain('Brak oceny');
  });

  it('treats a measurement of zero as available', () => {
    renderMatches([createFeatureMatch({ level: 'low', measurement: 0, match: 1 })]);

    const row = getRows()[0];
    expect(getCell(row, '.preference-measurement')).toBe('0');
    expect(getCell(row, '.preference-score')).toBe('100%');
    expect(getText()).toContain('Pomiary dostępne dla 1 z 1 aktywnych preferencji.');
    expect(fixture.nativeElement.querySelector('.missing-measurements-hint')).toBeNull();
  });

  it('keeps an active preference visible when its measurement is unavailable', () => {
    renderMatches([createFeatureMatch({ measurement: null, match: null })]);

    const row = getRows()[0];
    expect(getCell(row, '.preference-name')).toBe('Energia');
    expect(getCell(row, '.preference-level')).toBe('Wysoki');
    expect(getCell(row, '.preference-measurement')).toBe('Brak pomiaru');
    expect(getCell(row, '.preference-score')).toBe('Brak oceny');
    expect(getText()).toContain('Pomiary dostępne dla 0 z 1 aktywnych preferencji.');
    expect(getText()).not.toContain('Nie wybrano aktywnych preferencji');
    expect(getText()).not.toContain('0%');
  });

  it('shows partial completeness without replacing missing measurements with zero', () => {
    renderMatches([
      createFeatureMatch({ feature: 'energy', level: 'low', measurement: 0.801, match: 0 }),
      createFeatureMatch({ feature: 'danceability', measurement: null, match: null }),
      createFeatureMatch({ feature: 'valence', level: 'medium', measurement: 0.5, match: 1 }),
    ]);

    const rows = getRows();
    expect(rows).toHaveLength(3);
    expect(getCell(rows[0], '.preference-score')).toBe('0%');
    expect(getCell(rows[1], '.preference-score')).toBe('Brak oceny');
    expect(getCell(rows[2], '.preference-score')).toBe('100%');
    expect(getText()).toContain('Pomiary dostępne dla 2 z 3 aktywnych preferencji.');
    expect(getText()).toContain('Brakujące pomiary nie są uwzględniane w średniej dopasowania.');
  });

  it('reports no available measurements without claiming there are no active preferences', () => {
    renderMatches([
      createFeatureMatch({ feature: 'energy', measurement: null, match: null }),
      createFeatureMatch({ feature: 'danceability', measurement: null, match: null }),
    ]);

    expect(getRows()).toHaveLength(2);
    expect(getText()).toContain('Pomiary dostępne dla 0 z 2 aktywnych preferencji.');
    expect(getText()).not.toContain('Nie wybrano aktywnych preferencji');
    expect(getText()).not.toContain('0%');
  });

  it.each([
    { match: 0.125, percentage: '12.5%' },
    { match: 0.333333, percentage: '33.3%' },
    { match: 1, percentage: '100%' },
  ])('formats $match as $percentage without changing the input', ({ match, percentage }) => {
    const featureMatch = Object.freeze(createFeatureMatch({ match }));
    renderMatches([featureMatch]);

    expect(getCell(getRows()[0], '.preference-score')).toBe(percentage);
    expect(featureMatch.match).toBe(match);
  });

  it('preserves the response order and does not recalculate preference matches', () => {
    const matches = Object.freeze([
      Object.freeze(
        createFeatureMatch({ feature: 'valence', level: 'low', measurement: 0.2, match: 0.4 })
      ),
      Object.freeze(createFeatureMatch({ feature: 'energy', match: 0.9 })),
    ]);
    renderMatches([...matches]);

    const rows = getRows();
    expect(rows.map((row) => getCell(row, '.preference-name'))).toEqual([
      'Pozytywność brzmienia (walencja)',
      'Energia',
    ]);
    expect(getCell(rows[0], '.preference-score')).toBe('40%');
    expect(getCell(rows[1], '.preference-score')).toBe('90%');
  });

  it('updates details and completeness when the input changes', () => {
    renderMatches([createFeatureMatch({ measurement: null, match: null })]);
    renderMatches([createFeatureMatch({ feature: 'acousticness', measurement: 0.8, match: 1 })]);

    expect(getRows()).toHaveLength(1);
    expect(getCell(getRows()[0], '.preference-name')).toBe('Akustyczność');
    expect(getText()).not.toContain('Energia');
    expect(getText()).not.toContain('Brak pomiaru');
    expect(getText()).toContain('Pomiary dostępne dla 1 z 1 aktywnych preferencji.');
    expect(fixture.nativeElement.querySelector('.missing-measurements-hint')).toBeNull();

    renderMatches([]);

    expect(getRows()).toHaveLength(0);
    expect(getText()).toContain('Nie wybrano aktywnych preferencji.');
    expect(fixture.nativeElement.querySelector('.measurement-summary')).toBeNull();
  });

  function renderMatches(matches: PlaylistFeatureMatch[]): void {
    fixture.componentRef.setInput('featureMatches', matches);
    fixture.detectChanges();
  }

  function getRows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.preference-match'));
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});

function getCell(row: HTMLElement, selector: string): string {
  const cell = row.querySelector(selector);

  if (!cell) {
    throw new Error(`Nie znaleziono elementu szczegółów preferencji: ${selector}`);
  }

  return cell.textContent.replace(/\s+/g, ' ').trim();
}

function createFeatureMatch(overrides: Partial<PlaylistFeatureMatch> = {}): PlaylistFeatureMatch {
  return {
    feature: 'energy',
    level: 'high',
    measurement: 0.8,
    match: 1,
    ...overrides,
  };
}
