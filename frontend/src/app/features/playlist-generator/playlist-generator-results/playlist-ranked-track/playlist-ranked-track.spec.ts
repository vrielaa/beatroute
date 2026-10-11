import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  PlaylistFeatureMatch,
  PlaylistTrackEvaluation,
} from '../../playlist-generator.models';
import { PlaylistRankedTrack } from './playlist-ranked-track';

describe('PlaylistRankedTrack', () => {
  let fixture: ComponentFixture<PlaylistRankedTrack>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlaylistRankedTrack] }).compileComponents();
    fixture = TestBed.createComponent(PlaylistRankedTrack);
  });

  it('displays the track name, all artists and the supplied one-based position', () => {
    renderTrack(createEvaluation(), 3);

    expect(getText('h3')).toBe('Przykładowy utwór');
    expect(getText('.track-artists')).toBe('Pierwszy artysta, Drugi artysta');
    expect(getText('.ranking-position')).toBe('Pozycja 3');
  });

  it.each([
    { overallMatch: 0.5, percentage: '50%' },
    { overallMatch: 0.333333, percentage: '33.3%' },
    { overallMatch: 1, percentage: '100%' },
  ])(
    'formats the supplied overall match $overallMatch as $percentage',
    ({ overallMatch, percentage }) => {
      renderTrack(createEvaluation({ overallMatch }));

      expect(getText('.overall-match-value')).toBe(percentage);
      expect(fixture.nativeElement.querySelector('.zero-match-hint')).toBeNull();
    }
  );

  it('keeps a zero match visible and explains why the track is still accepted', () => {
    renderTrack(
      createEvaluation({
        overallMatch: 0,
        featureMatches: [createFeatureMatch({ level: 'low', measurement: 0.801, match: 0 })],
      })
    );

    expect(getText('.overall-match-value')).toBe('0%');
    expect(getText('.zero-match-hint')).toContain('Utwór spełnia wymagania obowiązkowe.');
    expect(getText('.zero-match-hint')).toContain(
      'Preferencje wpływają na kolejność, nie na odrzucenie.'
    );
    expect(getText('.preference-measurement')).toBe('0.801');
    expect(getText('.preference-score')).toBe('0%');
    expect(getText('.overall-match-value')).not.toContain('Brak');
  });

  it('distinguishes inactive preferences from a numeric zero score', () => {
    renderTrack(createEvaluation({ overallMatch: null, featureMatches: [] }));

    expect(getText('.overall-match-value')).toBe('Bez aktywnych preferencji');
    expect(getText('app-playlist-preference-matches')).toContain(
      'Nie wybrano aktywnych preferencji.'
    );
    expect(getText()).not.toContain('0%');
    expect(getText()).not.toContain('Brak dostępnych pomiarów');
    expect(fixture.nativeElement.querySelector('.zero-match-hint')).toBeNull();
  });

  it('distinguishes unavailable measurements from inactive preferences', () => {
    renderTrack(
      createEvaluation({
        overallMatch: null,
        featureMatches: [createFeatureMatch({ measurement: null, match: null })],
      })
    );

    expect(getText('.overall-match-value')).toBe('Brak dostępnych pomiarów');
    expect(getText('app-playlist-preference-matches')).toContain(
      'Pomiary dostępne dla 0 z 1 aktywnych preferencji.'
    );
    expect(getText('.preference-measurement')).toBe('Brak pomiaru');
    expect(getText('.preference-score')).toBe('Brak oceny');
    expect(getText()).not.toContain('Bez aktywnych preferencji');
    expect(getText()).not.toContain('0%');
  });

  it('shows the overall score with partially missing measurements and renders the real child', () => {
    renderTrack(
      createEvaluation({
        overallMatch: 1,
        featureMatches: [
          createFeatureMatch(),
          createFeatureMatch({ feature: 'danceability', measurement: null, match: null }),
        ],
      })
    );

    expect(getText('.overall-match-value')).toBe('100%');
    expect(fixture.nativeElement.querySelectorAll('.preference-match')).toHaveLength(2);
    expect(getText('app-playlist-preference-matches')).toContain('Energia');
    expect(getText('app-playlist-preference-matches')).toContain('Taneczność');
    expect(getText('app-playlist-preference-matches')).toContain(
      'Pomiary dostępne dla 1 z 2 aktywnych preferencji.'
    );
    expect(getText('app-playlist-preference-matches')).toContain('Brak oceny');
  });

  it('does not recalculate the backend score or mutate the evaluation', () => {
    const evaluation = createEvaluation({
      overallMatch: 0.42,
      featureMatches: [createFeatureMatch({ match: 1 })],
    });
    const originalEvaluation = structuredClone(evaluation);
    Object.freeze(evaluation);
    Object.freeze(evaluation.featureMatches);
    Object.freeze(evaluation.featureMatches[0]);

    renderTrack(evaluation);

    expect(getText('.overall-match-value')).toBe('42%');
    expect(getText('.preference-score')).toBe('100%');
    expect(evaluation).toEqual(originalEvaluation);
  });

  it('updates metadata, position and score when another track is supplied', () => {
    renderTrack(createEvaluation({ overallMatch: 0 }), 1);
    const evaluation = createEvaluation({ overallMatch: null, featureMatches: [] });
    evaluation.track = {
      ...evaluation.track,
      id: 'another-track',
      name: 'Kolejny utwór',
      artists: ['Inny artysta'],
    };

    renderTrack(evaluation, 5);

    expect(getText('h3')).toBe('Kolejny utwór');
    expect(getText('.track-artists')).toBe('Inny artysta');
    expect(getText('.ranking-position')).toBe('Pozycja 5');
    expect(getText('.overall-match-value')).toBe('Bez aktywnych preferencji');
    expect(getText()).not.toContain('Przykładowy utwór');
    expect(fixture.nativeElement.querySelector('.zero-match-hint')).toBeNull();
    expect(fixture.nativeElement.querySelector('.preference-match')).toBeNull();

    renderTrack(createEvaluation(), 2);

    expect(getText('.ranking-position')).toBe('Pozycja 2');
    expect(getText('.overall-match-value')).toBe('100%');
    expect(getText('.preference-name')).toBe('Energia');
  });

  it('renders metadata as text rather than interpreting it as HTML', () => {
    const evaluation = createEvaluation();
    evaluation.track = {
      ...evaluation.track,
      name: '<img src="invalid" onerror="alert(1)">',
      artists: ['<b>Artysta</b>'],
    };

    renderTrack(evaluation);

    expect(getText('h3')).toBe(evaluation.track.name);
    expect(getText('.track-artists')).toBe('<b>Artysta</b>');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
  });

  function renderTrack(evaluation: PlaylistTrackEvaluation, position = 1): void {
    fixture.componentRef.setInput('evaluation', evaluation);
    fixture.componentRef.setInput('position', position);
    fixture.detectChanges();
  }

  function getText(selector?: string): string {
    const element: HTMLElement | null = selector
      ? fixture.nativeElement.querySelector(selector)
      : fixture.nativeElement;

    if (!element) {
      throw new Error(`Nie znaleziono elementu karty utworu: ${selector}`);
    }

    return element.textContent.replace(/\s+/g, ' ').trim();
  }
});

function createEvaluation(
  overrides: Partial<PlaylistTrackEvaluation> = {}
): PlaylistTrackEvaluation {
  return {
    track: {
      id: 'example-track',
      name: 'Przykładowy utwór',
      artists: ['Pierwszy artysta', 'Drugi artysta'],
      audioFeatures: {
        tempo: 128,
        energy: 0.8,
        danceability: 0.7,
        valence: 0.5,
        acousticness: 0.1,
        instrumentalness: 0.2,
        speechiness: 0.1,
        liveness: 0.1,
      },
    },
    overallMatch: 1,
    featureMatches: [createFeatureMatch()],
    ...overrides,
  };
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
