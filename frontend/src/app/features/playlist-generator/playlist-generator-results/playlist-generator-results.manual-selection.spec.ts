import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedPlaylist, PlaylistTrackEvaluation } from '../playlist-generator.models';
import { PlaylistGeneratorResults } from './playlist-generator-results';

describe('PlaylistGeneratorResults manual selection', () => {
  let fixture: ComponentFixture<PlaylistGeneratorResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGeneratorResults],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGeneratorResults);
  });

  it('renders a checked, disabled checkbox for each accepted track in the default Top N mode', () => {
    renderResult(createResult());

    expect(getCheckboxes()).toHaveLength(3);
    expect(getCheckboxes().every((checkbox) => checkbox.checked && checkbox.disabled)).toBe(true);
    expect(getCheckedIds()).toEqual(['track-1', 'track-2', 'track-3']);
    expect(getSelectionCount()).toBe('Wybrano 3 ze 3.');
  });

  it('reflects the first N positions without allowing checkbox clicks to alter Top N', () => {
    renderResult(createResult());
    setTrackCount('2');

    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    getCheckbox('track-3').click();
    fixture.detectChanges();

    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');

    setTrackCount('1');

    expect(getCheckedIds()).toEqual(['track-1']);
    expect(getCheckboxes().every((checkbox) => checkbox.disabled)).toBe(true);
  });

  it('keeps all track details available while changing the manual selection', () => {
    renderResult(createResult());
    selectMode('Ręcznie');
    toggleTrack('track-1');

    expect(fixture.nativeElement.querySelector('app-playlist-ranked-track details')).toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll(
        'app-playlist-ranked-track app-playlist-preference-matches'
      )
    ).toHaveLength(3);
    expect(getCheckedIds()).toEqual(['track-2', 'track-3']);
    toggleTrack('track-1');

    expect(getCheckedIds()).toEqual(['track-1', 'track-2', 'track-3']);
  });

  it.each(['Top N', 'Ręcznie'])(
    'preserves %s selection when the entire ranking is collapsed and expanded',
    (mode) => {
      renderResult(createResult());
      setTrackCount('2');
      if (mode === 'Ręcznie') {
        selectMode(mode);
        toggleTrack('track-1');
        toggleTrack('track-3');
      }
      const selectedIds = getCheckedIds();
      const selectedTrackIdsChange = vi.fn();
      fixture.componentInstance.selectedTrackIdsChange.subscribe(selectedTrackIdsChange);
      const details: HTMLDetailsElement | null =
        fixture.nativeElement.querySelector('.accepted-tracks');
      const summary = details?.querySelector('summary');
      if (!details || !summary)
        throw new Error('Nie znaleziono zwijanej listy dopuszczonych utworów');

      summary.click();
      fixture.detectChanges();

      expect(details.open).toBe(false);
      expect(getCheckedIds()).toEqual(selectedIds);

      summary.click();
      fixture.detectChanges();

      expect(details.open).toBe(true);
      expect(getCheckedIds()).toEqual(selectedIds);
      expect(getCountInput().value).toBe('2');
      expect(selectedTrackIdsChange).not.toHaveBeenCalled();
    }
  );

  it('ignores a programmatically dispatched checkbox change in Top N', () => {
    renderResult(createResult());
    setTrackCount('1');
    const checkbox = getCheckbox('track-3');
    checkbox.checked = true;

    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(getSelectionCount()).toBe('Wybrano 1 ze 3.');
    selectMode('Ręcznie');
    expect(getSelectionCount()).toBe('Wybrano 1 ze 3.');
  });

  it('preserves the current Top N selection and enables accepted checkboxes in manual mode', () => {
    renderResult(createResult());
    setTrackCount('2');

    selectMode('Ręcznie');

    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    expect(getCheckboxes().every((checkbox) => !checkbox.disabled)).toBe(true);
    expect(getCountInput().disabled).toBe(true);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');
  });

  it('can remove and add any accepted track without changing the full ranking or evaluations', () => {
    const result = createResult();
    const originalResult = structuredClone(result);
    renderResult(result);
    setTrackCount('2');
    selectMode('Ręcznie');

    toggleTrack('track-1');
    toggleTrack('track-3');

    expect(getCheckedIds()).toEqual(['track-2', 'track-3']);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');
    expect(getRankingNames()).toEqual(['Utwór track-1', 'Utwór track-2', 'Utwór track-3']);
    expect(result).toEqual(originalResult);
  });

  it('allows selecting more tracks manually than the saved N', () => {
    renderResult(createResult());
    setTrackCount('1');
    selectMode('Ręcznie');

    toggleTrack('track-2');
    toggleTrack('track-3');

    expect(getCountInput().value).toBe('1');
    expect(getCountInput().disabled).toBe(true);
    expect(getSelectionCount()).toBe('Wybrano 3 ze 3.');
    expect(getCheckedIds()).toEqual(['track-1', 'track-2', 'track-3']);
  });

  it('allows clearing the entire manual selection and choosing again without an error', () => {
    renderResult(createResult());
    selectMode('Ręcznie');

    toggleTrack('track-1');
    toggleTrack('track-2');
    toggleTrack('track-3');

    expect(getCheckedIds()).toEqual([]);
    expect(getSelectionCount()).toBe('Wybrano 0 ze 3.');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    toggleTrack('track-3');

    expect(getCheckedIds()).toEqual(['track-3']);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 3.');
  });

  it('keeps ranking order when tracks are clicked in reverse order', () => {
    renderResult(createResult());
    setTrackCount('');
    selectMode('Ręcznie');

    toggleTrack('track-3');
    toggleTrack('track-1');

    expect(getCheckedIds()).toEqual(['track-1', 'track-3']);
    expect(getRankingNames()).toEqual(['Utwór track-1', 'Utwór track-2', 'Utwór track-3']);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');
  });

  it('does not duplicate an ID when the same checked state is reported repeatedly', () => {
    renderResult(createResult());
    setTrackCount('1');
    selectMode('Ręcznie');
    toggleTrack('track-3');

    getCheckbox('track-3').dispatchEvent(new Event('change'));
    getCheckbox('track-3').dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(getCheckedIds()).toEqual(['track-1', 'track-3']);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');
  });

  it('replaces manual choices with Top N and uses that new starting point on the next switch', () => {
    renderResult(createResult());
    setTrackCount('2');
    selectMode('Ręcznie');
    toggleTrack('track-1');
    toggleTrack('track-3');
    expect(getCheckedIds()).toEqual(['track-2', 'track-3']);

    selectMode('Top N');

    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    expect(getCountInput().value).toBe('2');
    expect(getCheckboxes().every((checkbox) => checkbox.disabled)).toBe(true);

    selectMode('Ręcznie');

    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    toggleTrack('track-1');
    selectMode('Ręcznie');
    expect(getCheckedIds()).toEqual(['track-2']);
  });

  it('permits manual selection after invalid N but still reports that N on returning to Top N', () => {
    renderResult(createResult());
    setTrackCount('4');
    expect(getCheckedIds()).toEqual([]);
    selectMode('Ręcznie');

    toggleTrack('track-3');

    expect(getCheckedIds()).toEqual(['track-3']);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 3.');
    expect(fixture.nativeElement.querySelector('.selection-error')).toBeNull();

    selectMode('Top N');

    expect(getCheckedIds()).toEqual([]);
    expect(getSelectionCount()).toBe('Wybrano 0 ze 3.');
    expect(fixture.nativeElement.querySelector('.selection-error')).not.toBeNull();
  });

  it('restores all accepted checks for a new result even with the same IDs in a different order', () => {
    renderResult(createResult());
    selectMode('Ręcznie');
    toggleTrack('track-1');
    toggleTrack('track-2');
    const nextResult = createResult();
    nextResult.rankedTracks.reverse();

    renderResult(nextResult);

    expect(getCheckedIds()).toEqual(['track-3', 'track-2', 'track-1']);
    expect(getCheckboxes().every((checkbox) => checkbox.disabled)).toBe(true);
    expect(getSelectionCount()).toBe('Wybrano 3 ze 3.');

    selectMode('Ręcznie');
    toggleTrack('track-3');

    expect(getCheckedIds()).toEqual(['track-2', 'track-1']);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 3.');
  });

  it('provides no checkbox for a rejected track while keeping its rejection visible', () => {
    const result = createResult();
    const rejected = result.rankedTracks.pop();

    if (!rejected) {
      throw new Error('Brak utworu do odrzucenia w danych testowych.');
    }

    result.rejectedTracks = [
      {
        track: rejected.track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      },
    ];
    renderResult(result);
    selectMode('Ręcznie');

    expect(getCheckboxes()).toHaveLength(2);
    expect(getCheckedIds()).toEqual(['track-1', 'track-2']);
    expect(fixture.nativeElement.querySelector('.rejected-track input')).toBeNull();
    expect(fixture.nativeElement.querySelector('.rejected-track h4').textContent.trim()).toBe(
      'Utwór track-3'
    );
  });

  it('allows manually selecting accepted zero-score and unscored tracks', () => {
    const result = createResult();
    result.rankedTracks[0].overallMatch = 0;
    result.rankedTracks[1].overallMatch = null;
    renderResult(result);
    setTrackCount('1');
    selectMode('Ręcznie');

    toggleTrack('track-1');
    toggleTrack('track-2');

    expect(getCheckedIds()).toEqual(['track-2']);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 3.');
    expect(getCheckboxes().every((checkbox) => !checkbox.disabled)).toBe(true);
  });

  it('associates each checkbox with a visible label identifying its track', () => {
    renderResult(createResult());

    expect(getCheckbox('track-1').closest('label')?.textContent.trim()).toBe(
      'Uwzględnij w playliście: Utwór track-1'
    );
    expect(getCheckbox('track-2').closest('label')?.textContent.trim()).toBe(
      'Uwzględnij w playliście: Utwór track-2'
    );
  });

  function renderResult(result: GeneratedPlaylist): void {
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
  }

  function getCheckboxes(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.track-selection-toggle input'));
  }

  function getCheckbox(trackId: string): HTMLInputElement {
    const checkbox = getCheckboxes().find((input) => input.value === trackId);

    if (!checkbox) {
      throw new Error(`Nie znaleziono checkboxa utworu: ${trackId}`);
    }

    return checkbox;
  }

  function getCheckedIds(): string[] {
    return getCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
  }

  function toggleTrack(trackId: string): void {
    getCheckbox(trackId).click();
    fixture.detectChanges();
  }

  function getCountInput(): HTMLInputElement {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(
      '#playlist-top-track-count'
    );

    if (!input) {
      throw new Error('Nie znaleziono pola N.');
    }

    return input;
  }

  function setTrackCount(value: string): void {
    const input = getCountInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function selectMode(label: string): void {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.selection-modes button')
    );
    const button = buttons.find((candidate) => candidate.textContent.trim() === label);

    if (!button) {
      throw new Error(`Nie znaleziono przycisku trybu: ${label}`);
    }

    button.click();
    fixture.detectChanges();
  }

  function getSelectionCount(): string {
    const counter: HTMLElement | null = fixture.nativeElement.querySelector('.selection-count');

    if (!counter) {
      throw new Error('Nie znaleziono licznika wyboru.');
    }

    return counter.textContent.replace(/\s+/g, ' ').trim();
  }

  function getRankingNames(): string[] {
    const headings: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-playlist-ranked-track h3')
    );
    return headings.map((heading) => heading.textContent.trim());
  }
});

function createResult(): GeneratedPlaylist {
  return {
    rankedTracks: ['track-1', 'track-2', 'track-3'].map(createEvaluation),
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
