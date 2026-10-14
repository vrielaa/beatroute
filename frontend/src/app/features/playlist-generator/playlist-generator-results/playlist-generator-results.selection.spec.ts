import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedPlaylist, PlaylistTrackEvaluation } from '../playlist-generator.models';
import { PlaylistGeneratorResults } from './playlist-generator-results';

describe('PlaylistGeneratorResults selection', () => {
  let fixture: ComponentFixture<PlaylistGeneratorResults>;
  let selectedTrackIdsChange: ReturnType<typeof vi.fn<(trackIds: string[]) => void>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGeneratorResults],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGeneratorResults);
    selectedTrackIdsChange = vi.fn();
    fixture.componentInstance.selectedTrackIdsChange.subscribe(selectedTrackIdsChange);
  });

  it('starts in Top N with every accepted track selected and no validation error', () => {
    renderResult(createResult(3));

    expect(getModeButton('Top N').getAttribute('aria-pressed')).toBe('true');
    expect(getModeButton('Ręcznie').getAttribute('aria-pressed')).toBe('false');
    expect(getCountInput().value).toBe('3');
    expect(getCountInput().disabled).toBe(false);
    expect(getCountInput().min).toBe('1');
    expect(getCountInput().max).toBe('3');
    expect(getCountInput().step).toBe('1');
    expect(getText('.selection-count')).toBe('Wybrano 3 ze 3.');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();
    expect(selectedTrackIdsChange).toHaveBeenCalledExactlyOnceWith([
      'track-1',
      'track-2',
      'track-3',
    ]);
  });

  it('selects 50 of 100 without changing or hiding any ranking positions', () => {
    const result = createResult(100);
    const originalResult = structuredClone(result);
    renderResult(result);

    setTrackCount('50');

    expect(getText('.selection-count')).toBe('Wybrano 50 ze 100.');
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith(
      Array.from({ length: 50 }, (_, index) => `track-${index + 1}`)
    );
    expect(getRankingNames()).toEqual(
      Array.from({ length: 100 }, (_, index) => `Utwór track-${index + 1}`)
    );
    expect(result).toEqual(originalResult);
  });

  it.each(['1', '3'])('accepts the boundary %s without reporting an error', (trackCount) => {
    renderResult(createResult(3));

    setTrackCount(trackCount);

    expect(getText('.selection-count')).toBe(`Wybrano ${trackCount} ze 3.`);
    expect(getCountInput().getAttribute('aria-invalid')).toBe('false');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();
  });

  it.each(['0', '-1', '1.5', '4'])(
    'reports %s without clamping, rounding or retaining the previous selection',
    (trackCount) => {
      renderResult(createResult(3));

      setTrackCount(trackCount);

      expect(getCountInput().value).toBe(trackCount);
      expect(getCountInput().getAttribute('aria-invalid')).toBe('true');
      expect(getCountInput().getAttribute('aria-describedby')).toContain(
        'playlist-track-count-error'
      );
      expect(getText('.selection-error')).toBe(
        'Liczba utworów musi być liczbą całkowitą od 1 do 3.'
      );
      expect(getText('.selection-count')).toBe('Wybrano 0 ze 3.');
      expect(selectedTrackIdsChange).toHaveBeenLastCalledWith([]);
      expect(getRankingNames()).toHaveLength(3);
    }
  );

  it.each(['', '1e309'])('does not select tracks for an empty or non-finite value: %s', (value) => {
    renderResult(createResult(3));

    setTrackCount(value);

    expect(getCountInput().getAttribute('aria-invalid')).toBe('true');
    expect(getText('.selection-count')).toBe('Wybrano 0 ze 3.');
    expect(fixture.nativeElement.querySelector('.selection-error[role="alert"]')).not.toBeNull();
  });

  it('removes the error and restores selection after correcting the count', () => {
    renderResult(createResult(3));
    setTrackCount('4');

    setTrackCount('2');

    expect(getText('.selection-count')).toBe('Wybrano 2 ze 3.');
    expect(getCountInput().getAttribute('aria-invalid')).toBe('false');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();
    expect(getCountInput().getAttribute('aria-describedby')).toBe('playlist-track-count-hint');
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith(['track-1', 'track-2']);
  });

  it('preserves Top N selection when entering manual mode and disables the count field', () => {
    renderResult(createResult(3));
    setTrackCount('2');

    selectMode('Ręcznie');

    expect(getText('.selection-count')).toBe('Wybrano 2 ze 3.');
    expect(getCountInput().disabled).toBe(true);
    expect(getCountInput().value).toBe('2');
    expect(getModeButton('Top N').getAttribute('aria-pressed')).toBe('false');
    expect(getModeButton('Ręcznie').getAttribute('aria-pressed')).toBe('true');
    expect(getText('.manual-selection-hint')).toBe('Wybierz ręcznie utwory.');
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith(['track-1', 'track-2']);
  });

  it('restores the saved N when returning to Top N and allows it to be edited again', () => {
    renderResult(createResult(3));
    setTrackCount('2');
    selectMode('Ręcznie');

    selectMode('Top N');

    expect(getCountInput().disabled).toBe(false);
    expect(getCountInput().value).toBe('2');
    expect(getText('.selection-count')).toBe('Wybrano 2 ze 3.');
    expect(fixture.nativeElement.querySelector('.manual-selection-hint')).toBeNull();

    setTrackCount('1');
    selectMode('Ręcznie');

    expect(getText('.selection-count')).toBe('Wybrano 1 ze 3.');
  });

  it('ignores count errors in manual mode but requires correction after returning to Top N', () => {
    renderResult(createResult(3));
    setTrackCount('4');

    selectMode('Ręcznie');

    expect(getCountInput().disabled).toBe(true);
    expect(getText('.selection-count')).toBe('Wybrano 0 ze 3.');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();

    selectMode('Top N');

    expect(getCountInput().disabled).toBe(false);
    expect(getCountInput().value).toBe('4');
    expect(getText('.selection-error')).toContain('od 1 do 3');
    expect(getText('.selection-count')).toBe('Wybrano 0 ze 3.');
  });

  it('does not reset the limit when the active mode button is clicked again', () => {
    renderResult(createResult(3));
    setTrackCount('2');

    selectMode('Top N');

    expect(getCountInput().value).toBe('2');
    expect(getText('.selection-count')).toBe('Wybrano 2 ze 3.');

    selectMode('Ręcznie');
    selectMode('Ręcznie');

    expect(getText('.selection-count')).toBe('Wybrano 2 ze 3.');
  });

  it('resets the mode and count for a new result with the same number of tracks', () => {
    renderResult(createResult(3));
    setTrackCount('1');
    selectMode('Ręcznie');

    const nextResult = createResult(3);
    nextResult.rankedTracks.reverse();
    renderResult(nextResult);

    expect(getModeButton('Top N').getAttribute('aria-pressed')).toBe('true');
    expect(getCountInput().disabled).toBe(false);
    expect(getCountInput().value).toBe('3');
    expect(getText('.selection-count')).toBe('Wybrano 3 ze 3.');
    expect(getRankingNames()).toEqual(['Utwór track-3', 'Utwór track-2', 'Utwór track-1']);
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith(['track-3', 'track-2', 'track-1']);

    selectMode('Ręcznie');

    expect(getText('.selection-count')).toBe('Wybrano 3 ze 3.');
  });

  it('resets a previously invalid limit to the size of a smaller new ranking', () => {
    renderResult(createResult(3));
    setTrackCount('4');

    renderResult(createResult(1));

    expect(getCountInput().value).toBe('1');
    expect(getCountInput().max).toBe('1');
    expect(getText('.selection-count')).toBe('Wybrano 1 ze 1.');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();
  });

  it('excludes rejected tracks from the count while keeping zero-score and unscored tracks', () => {
    const result = createResult(2);
    result.rankedTracks[0].overallMatch = 0;
    result.rankedTracks[1].overallMatch = null;
    result.rejectedTracks = [
      {
        track: createEvaluation('rejected').track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      },
    ];
    renderResult(result);

    expect(getCountInput().max).toBe('2');
    expect(getText('.selection-count')).toBe('Wybrano 2 ze 2.');
    expect(getRankingNames()).toEqual(['Utwór track-1', 'Utwór track-2']);

    setTrackCount('3');

    expect(getText('.selection-error')).toContain('od 1 do 2');
    expect(getText('.selection-count')).toBe('Wybrano 0 ze 2.');
  });

  it('offers no selection controls for an empty ranking and restores defaults for a new one', () => {
    renderResult(createResult(3));
    setTrackCount('1');
    selectMode('Ręcznie');

    renderResult(createResult(0));

    expect(fixture.nativeElement.querySelector('.playlist-selection')).toBeNull();
    expect(fixture.nativeElement.querySelector('.selection-count')).toBeNull();
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    renderResult(createResult(2));

    expect(getModeButton('Top N').getAttribute('aria-pressed')).toBe('true');
    expect(getCountInput().value).toBe('2');
    expect(getText('.selection-count')).toBe('Wybrano 2 ze 2.');
  });

  it('does not mutate a frozen result when changing limits and modes', () => {
    const result = createResult(3);
    const originalResult = structuredClone(result);
    Object.freeze(result);
    Object.freeze(result.rankedTracks);
    Object.freeze(result.rejectedTracks);
    result.rankedTracks.forEach((evaluation) => Object.freeze(evaluation));
    renderResult(result);

    setTrackCount('1');
    selectMode('Ręcznie');
    selectMode('Top N');

    expect(result).toEqual(originalResult);
    expect(getRankingNames()).toHaveLength(3);
    expect(getText('.selection-count')).toBe('Wybrano 1 ze 3.');
  });

  it('emits a copy so a receiver cannot mutate the internal selection', () => {
    renderResult(createResult(3));
    const emittedIds = selectedTrackIdsChange.mock.calls.at(-1)?.[0];

    if (!emittedIds) {
      throw new Error('Komponent nie wyemitował wyboru utworów.');
    }

    emittedIds.length = 0;
    fixture.detectChanges();

    expect(getText('.selection-count')).toBe('Wybrano 3 ze 3.');
    expect(getCountInput().value).toBe('3');
    selectMode('Ręcznie');
    expect(selectedTrackIdsChange).toHaveBeenLastCalledWith(['track-1', 'track-2', 'track-3']);
  });

  function renderResult(result: GeneratedPlaylist): void {
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
  }

  function getCountInput(): HTMLInputElement {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(
      '#playlist-top-track-count'
    );

    if (!input) {
      throw new Error('Nie znaleziono pola liczby utworów.');
    }

    return input;
  }

  function setTrackCount(value: string): void {
    const input = getCountInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function getModeButton(label: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.selection-modes button')
    );
    const button = buttons.find((candidate) => candidate.textContent.trim() === label);

    if (!button) {
      throw new Error(`Nie znaleziono przycisku trybu: ${label}`);
    }

    return button;
  }

  function selectMode(label: string): void {
    getModeButton(label).click();
    fixture.detectChanges();
  }

  function getText(selector: string): string {
    const element: HTMLElement | null = fixture.nativeElement.querySelector(selector);

    if (!element) {
      throw new Error(`Nie znaleziono elementu wyboru utworów: ${selector}`);
    }

    return element.textContent.replace(/\s+/g, ' ').trim();
  }

  function getRankingNames(): string[] {
    const headings: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-playlist-ranked-track h3')
    );
    return headings.map((heading) => heading.textContent.trim());
  }
});

function createResult(trackCount: number): GeneratedPlaylist {
  return {
    rankedTracks: Array.from({ length: trackCount }, (_, index) =>
      createEvaluation(`track-${index + 1}`)
    ),
    rejectedTracks: [],
  };
}

function createEvaluation(id: string): PlaylistTrackEvaluation {
  return {
    track: {
      id,
      name: `Utwór ${id}`,
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
    },
    overallMatch: 0.5,
    featureMatches: [],
  };
}
