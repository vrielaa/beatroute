import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  GeneratedPlaylist,
  PlaylistTrack,
  PlaylistTrackEvaluation,
  RejectedPlaylistTrack,
} from '../playlist-generator.models';
import { PlaylistGeneratorResults } from './playlist-generator-results';

describe('PlaylistGeneratorResults', () => {
  let fixture: ComponentFixture<PlaylistGeneratorResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGeneratorResults],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGeneratorResults);
  });

  it('summarizes both groups and renders real ranking, preference and rejection components', () => {
    renderResult({
      rankedTracks: [
        createEvaluation('accepted-1', 'Pierwszy'),
        createEvaluation('accepted-2', 'Drugi'),
      ],
      rejectedTracks: [createRejection('rejected-1', 'Odrzucony')],
    });

    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 2.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 1.');
    expect(getElements('app-playlist-ranked-track')).toHaveLength(2);
    expect(getElements('app-playlist-preference-matches')).toHaveLength(2);
    expect(getElements('app-playlist-rejected-tracks')).toHaveLength(1);
    expect(getElements('.rejected-track')).toHaveLength(1);
    expect(getText('.rejected-track')).toContain('Odrzucony');
    expect(getText('.rejection-reasons')).toContain('Tempo (BPM) jest poza wybranym zakresem.');
    expect(getText('.preference-name')).toBe('Energia');
    expect(getText('.preference-score')).toBe('100%');
  });

  it('preserves backend order without sorting by name or recalculating positions from scores', () => {
    renderResult({
      rankedTracks: [createEvaluation('zeta', 'Zeta', 0.25), createEvaluation('alfa', 'Alfa', 1)],
      rejectedTracks: [],
    });

    expect(getRankingNames()).toEqual(['Zeta', 'Alfa']);
    expect(getElements('.ranking-position').map((element) => element.textContent.trim())).toEqual([
      'Pozycja 1',
      'Pozycja 2',
    ]);
    expect(
      getElements('.overall-match-value').map((element) => element.textContent.trim())
    ).toEqual(['25%', '100%']);
  });

  it('keeps accepted tracks with zero match in the ranking and explains the distinction', () => {
    renderResult({
      rankedTracks: [createEvaluation('zero-match', 'Spełnia wymagania', 0)],
      rejectedTracks: [createRejection('rejected', 'Nie spełnia wymagań')],
    });

    expect(getRankingNames()).toEqual(['Spełnia wymagania']);
    expect(getText('.overall-match-value')).toBe('0%');
    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 1.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 1.');
    expect(getText('.results-explanation')).toContain(
      'Utwory w rankingu spełniają wymagania obowiązkowe.'
    );
    expect(getText('.results-explanation')).toContain(
      'Preferencje wpływają na ich kolejność, nie na odrzucenie.'
    );
    expect(getText('.results-explanation')).toContain(
      'Utwór może znaleźć się w wynikach także z dopasowaniem 0%.'
    );
    expect(getText('.score-explanation')).toContain('nie prawdopodobieństwem polubienia utworu');
  });

  it('shows an empty ranking as a valid outcome and still displays every rejection', () => {
    renderResult({
      rankedTracks: [],
      rejectedTracks: [createRejection('first', 'Pierwszy'), createRejection('second', 'Drugi')],
    });

    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 0.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 2.');
    expect(getText('.empty-ranking')).toContain('Żaden utwór nie spełnia aktywnych wymagań.');
    expect(getElements('.playlist-ranking')).toHaveLength(0);
    expect(getElements('app-playlist-ranked-track')).toHaveLength(0);
    expect(getElements('.rejected-track')).toHaveLength(2);
    expect(getElements('[role="alert"]')).toHaveLength(0);
  });

  it('shows the ranking and a no-rejections message when every track is accepted', () => {
    renderResult({
      rankedTracks: [createEvaluation('accepted', 'Dopuszczony')],
      rejectedTracks: [],
    });

    expect(getRankingNames()).toEqual(['Dopuszczony']);
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 0.');
    expect(getText('.rejections-empty')).toContain('Żaden utwór nie został odrzucony');
    expect(getElements('.rejected-track')).toHaveLength(0);
    expect(getElements('.empty-ranking')).toHaveLength(0);
  });

  it('supports both empty groups without displaying stale cards or an error', () => {
    renderResult({ rankedTracks: [], rejectedTracks: [] });

    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 0.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 0.');
    expect(getElements('.playlist-ranking')).toHaveLength(0);
    expect(getElements('.rejected-track')).toHaveLength(0);
    expect(getElements('[role="alert"]')).toHaveLength(0);
  });

  it('preserves source order when preferences are disabled rather than displaying zero scores', () => {
    renderResult({
      rankedTracks: [
        createEvaluation('zeta', 'Zeta', null),
        createEvaluation('alfa', 'Alfa', null),
      ],
      rejectedTracks: [],
    });

    expect(getRankingNames()).toEqual(['Zeta', 'Alfa']);
    expect(
      getElements('.overall-match-value').map((element) => element.textContent.trim())
    ).toEqual(['Bez aktywnych preferencji', 'Bez aktywnych preferencji']);
    expect(getElements('.preference-match')).toHaveLength(0);
  });

  it('forwards unavailable measurements to the card without removing an accepted track', () => {
    const evaluation = createEvaluation('missing-data', 'Bez pomiaru', null);
    evaluation.featureMatches = [
      { feature: 'energy', level: 'high', measurement: null, match: null },
    ];

    renderResult({ rankedTracks: [evaluation], rejectedTracks: [] });

    expect(getRankingNames()).toEqual(['Bez pomiaru']);
    expect(getText('.overall-match-value')).toBe('Brak dostępnych pomiarów');
    expect(getText('.measurement-summary')).toBe(
      'Pomiary dostępne dla 0 z 1 aktywnych preferencji.'
    );
    expect(getText('.preference-score')).toBe('Brak oceny');
    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 1.');
  });

  it('preserves backend order for ties and unscored tracks', () => {
    renderResult({
      rankedTracks: [
        createEvaluation('tied-z', 'Zeta', 0.5),
        createEvaluation('tied-a', 'Alfa', 0.5),
        createEvaluation('unscored-z', 'Zeta bez oceny', null),
        createEvaluation('unscored-a', 'Alfa bez oceny', null),
      ],
      rejectedTracks: [],
    });

    expect(getRankingNames()).toEqual(['Zeta', 'Alfa', 'Zeta bez oceny', 'Alfa bez oceny']);
    expect(getElements('.ranking-position').map((element) => element.textContent.trim())).toEqual([
      'Pozycja 1',
      'Pozycja 2',
      'Pozycja 3',
      'Pozycja 4',
    ]);
  });

  it('refreshes positions and scores when the same track IDs arrive in a new order', () => {
    renderResult({
      rankedTracks: [
        createEvaluation('first', 'Pierwszy', 1),
        createEvaluation('second', 'Drugi', 0),
      ],
      rejectedTracks: [],
    });
    renderResult({
      rankedTracks: [
        createEvaluation('second', 'Drugi', 0.8),
        createEvaluation('first', 'Pierwszy', 0.2),
      ],
      rejectedTracks: [],
    });

    expect(getRankingNames()).toEqual(['Drugi', 'Pierwszy']);
    expect(getElements('.ranking-position').map((element) => element.textContent.trim())).toEqual([
      'Pozycja 1',
      'Pozycja 2',
    ]);
    expect(
      getElements('.overall-match-value').map((element) => element.textContent.trim())
    ).toEqual(['80%', '20%']);
    expect(getElements('.zero-match-hint')).toHaveLength(0);
  });

  it('updates counts and moves a track from the ranking to rejections when a new result arrives', () => {
    renderResult({
      rankedTracks: [createEvaluation('same-track', 'Utwór')],
      rejectedTracks: [],
    });
    renderResult({
      rankedTracks: [],
      rejectedTracks: [createRejection('same-track', 'Utwór')],
    });

    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 0.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 1.');
    expect(getElements('app-playlist-ranked-track')).toHaveLength(0);
    expect(getText('.rejected-track')).toContain('Utwór');
    expect(getElements('.empty-ranking')).toHaveLength(1);

    renderResult({ rankedTracks: [createEvaluation('new', 'Nowy utwór')], rejectedTracks: [] });

    expect(getText('.generation-summary')).toContain('Dopuszczone utwory: 1.');
    expect(getText('.generation-summary')).toContain('Odrzucone utwory: 0.');
    expect(getRankingNames()).toEqual(['Nowy utwór']);
    expect(getElements('.rejected-track')).toHaveLength(0);
    expect(getElements('.empty-ranking')).toHaveLength(0);
  });

  it('does not mutate the supplied result or recalculate the supplied evaluation', () => {
    const evaluation = createEvaluation('accepted', 'Dopuszczony', 0.42);
    evaluation.featureMatches[0].match = 1;
    const result: GeneratedPlaylist = {
      rankedTracks: [evaluation],
      rejectedTracks: [createRejection('rejected', 'Odrzucony')],
    };
    const originalResult = structuredClone(result);
    Object.freeze(result);
    Object.freeze(result.rankedTracks);
    Object.freeze(result.rejectedTracks);
    Object.freeze(evaluation);

    renderResult(result);

    expect(getText('.overall-match-value')).toBe('42%');
    expect(getText('.preference-score')).toBe('100%');
    expect(result).toEqual(originalResult);
  });

  function renderResult(result: GeneratedPlaylist): void {
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
  }

  function getElements(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector));
  }

  function getText(selector: string): string {
    const element: HTMLElement | null = fixture.nativeElement.querySelector(selector);

    if (!element) {
      throw new Error(`Nie znaleziono elementu wyników generatora: ${selector}`);
    }

    return element.textContent.replace(/\s+/g, ' ').trim();
  }

  function getRankingNames(): string[] {
    return getElements('app-playlist-ranked-track h3').map((element) => element.textContent.trim());
  }
});

function createTrack(id: string, name: string): PlaylistTrack {
  return {
    id,
    name,
    artists: ['Przykładowy artysta'],
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
  };
}

function createEvaluation(
  id: string,
  name: string,
  overallMatch: number | null = 1
): PlaylistTrackEvaluation {
  return {
    track: createTrack(id, name),
    overallMatch,
    featureMatches:
      overallMatch === null
        ? []
        : [{ feature: 'energy', level: 'high', measurement: 0.8, match: overallMatch }],
  };
}

function createRejection(id: string, name: string): RejectedPlaylistTrack {
  return {
    track: createTrack(id, name),
    reasons: [{ feature: 'tempo', code: 'outside-range' }],
  };
}
