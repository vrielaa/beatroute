import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import { PlaylistGeneratorResults } from './playlist-generator-results/playlist-generator-results';
import type {
  GeneratedPlaylist,
  PlaylistDataset,
  PlaylistTrack,
} from './playlist-generator.models';

describe('PlaylistGenerator selection', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;
  let dataset: PlaylistDataset;

  beforeEach(async () => {
    dataset = createDataset();
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('keeps an empty page selection before generation, including after local file import', async () => {
    expect(getSelectedTrackIds()).toEqual([]);

    await importFile();

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    http.expectNone(() => true);
  });

  it('receives all accepted IDs in ranking order, excluding rejected tracks', async () => {
    await showInitialResult();

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id, dataset.tracks[0].id]);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 2.');
    http.expectNone(() => true);
  });

  it('updates the page selection after changing N without any new HTTP request', async () => {
    await showInitialResult();

    setTrackCount('1');

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id]);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 2.');
    http.expectNone(() => true);
  });

  it.each(['0', '3', '1.5', ''])('clears stale page selection for invalid N: %s', async (value) => {
    await showInitialResult();

    setTrackCount(value);

    expect(getSelectedTrackIds()).toEqual([]);
    expect(getSelectionCount()).toBe('Wybrano 0 ze 2.');
    http.expectNone(() => true);
  });

  it('receives manual choices in ranking order rather than click order', async () => {
    await showInitialResult();
    setTrackCount('');
    selectMode('Ręcznie');

    toggleTrack(dataset.tracks[0].id);
    toggleTrack(dataset.tracks[2].id);

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id, dataset.tracks[0].id]);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 2.');
    http.expectNone(() => true);
  });

  it('receives an empty manual choice and later replaces it with a new selection', async () => {
    await showInitialResult();
    selectMode('Ręcznie');

    toggleTrack(dataset.tracks[2].id);
    toggleTrack(dataset.tracks[0].id);

    expect(getSelectedTrackIds()).toEqual([]);
    expect(getSelectionCount()).toBe('Wybrano 0 ze 2.');

    toggleTrack(dataset.tracks[0].id);

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[0].id]);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 2.');
    http.expectNone(() => true);
  });

  it('drops manual choices when returning to Top N and does not change the ranking', async () => {
    const response = createResult(dataset);
    const originalResponse = structuredClone(response);
    await showInitialResult(response);
    setTrackCount('1');
    selectMode('Ręcznie');
    toggleTrack(dataset.tracks[2].id);
    toggleTrack(dataset.tracks[0].id);
    expect(getSelectedTrackIds()).toEqual([dataset.tracks[0].id]);

    selectMode('Top N');

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id]);
    expect(response).toEqual(originalResponse);
    http.expectNone(() => true);
  });

  it('normalizes the received IDs against the current ranking without mutating the event payload', async () => {
    await showInitialResult();
    const receivedIds = [
      'unknown',
      dataset.tracks[1].id,
      dataset.tracks[0].id,
      dataset.tracks[2].id,
      dataset.tracks[0].id,
    ];
    const originalIds = [...receivedIds];
    Object.freeze(receivedIds);

    getResultsComponent().selectedTrackIdsChange.emit(receivedIds);

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id, dataset.tracks[0].id]);
    expect(receivedIds).toEqual(originalIds);
    expect(getSelectedTrackIds()).not.toBe(receivedIds);
    http.expectNone(() => true);
  });

  it('clears selection when criteria change while preserving the prepared data for analysis', async () => {
    await showInitialResult();

    setEnergyPreference('high');

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    expect(fixture.componentInstance['preparedDataset']()?.dataset).toEqual(dataset);
    http.expectNone(() => true);

    startGeneration();
    const analysis = http.expectOne('/api/playlist-generator/generate');
    expect(analysis.request.body.dataset).toEqual(dataset);
    http.expectNone('/api/playlist-generator/prepare-dataset');
    analysis.flush(createResult(dataset));
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id, dataset.tracks[0].id]);
  });

  it('clears selection immediately while regenerating and resets it for the new result', async () => {
    await showInitialResult();
    setTrackCount('1');
    selectMode('Ręcznie');
    const nextResult = createResult(dataset);
    nextResult.rankedTracks.reverse();
    nextResult.rankedTracks[0].overallMatch = 0.9;
    nextResult.rankedTracks[1].overallMatch = 0.1;

    startGeneration();

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    http.expectNone('/api/playlist-generator/prepare-dataset');
    http.expectOne('/api/playlist-generator/generate').flush(nextResult);
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[0].id, dataset.tracks[2].id]);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 2.');
    expect(getInput('playlist-top-track-count').value).toBe('2');
    expect(getInput('playlist-top-track-count').disabled).toBe(false);
  });

  it('leaves selection empty if the new ranking is empty', async () => {
    await showInitialResult();
    startGeneration();

    http.expectOne('/api/playlist-generator/generate').flush({
      rankedTracks: [],
      rejectedTracks: dataset.tracks.map((track) => ({
        track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      })),
    });
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.playlist-selection')).toBeNull();
    http.expectNone(() => true);
  });

  it('clears selection when a replacement file is imported, without automatically requesting data', async () => {
    await showInitialResult();

    await importFile('replacement.json');

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.componentInstance['preparedDataset']()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    http.expectNone(() => true);
  });

  it('clears selection even when a replacement file is invalid', async () => {
    await showInitialResult();

    await importFile('broken.json', '{');

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dataset-import-error').textContent).toContain(
      'Plik nie zawiera poprawnego JSON-a'
    );
    http.expectNone(() => true);
  });

  it('preserves the manual selection and result when the file picker is cancelled', async () => {
    await showInitialResult();
    setTrackCount('1');
    selectMode('Ręcznie');
    toggleTrack(dataset.tracks[2].id);
    toggleTrack(dataset.tracks[0].id);
    const resultsComponent = getResultsComponent();

    selectFile(null);
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[0].id]);
    expect(getResultsComponent()).toBe(resultsComponent);
    expect(getSelectionCount()).toBe('Wybrano 1 ze 2.');
    http.expectNone(() => true);
  });

  it('keeps selection empty after an analysis failure and restores defaults after a successful retry', async () => {
    await showInitialResult();
    setTrackCount('1');
    startGeneration();

    http.expectOne('/api/playlist-generator/generate').flush(
      {},
      {
        status: 500,
        statusText: 'Internal Server Error',
      }
    );
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.generation-error')).not.toBeNull();

    startGeneration();
    http.expectNone('/api/playlist-generator/prepare-dataset');
    http.expectOne('/api/playlist-generator/generate').flush(createResult(dataset));
    fixture.detectChanges();

    expect(getSelectedTrackIds()).toEqual([dataset.tracks[2].id, dataset.tracks[0].id]);
    expect(getSelectionCount()).toBe('Wybrano 2 ze 2.');
  });

  it('ignores a selection received without a current result', () => {
    fixture.componentInstance['updateSelectedTrackIds']([dataset.tracks[0].id]);

    expect(getSelectedTrackIds()).toEqual([]);
    http.expectNone(() => true);
  });

  async function showInitialResult(response = createResult(dataset)): Promise<void> {
    await importFile();
    startGeneration();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    expect(preparation.request.body).toEqual({
      version: 1,
      spotifyTrackIds: dataset.tracks.map((track) => track.id),
    });
    preparation.flush({ dataset, skippedTracks: [], incompleteTracks: [] });
    http.expectOne('/api/playlist-generator/generate').flush(response);
    fixture.detectChanges();
  }

  function startGeneration(): void {
    const button: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('#playlist-generate');

    if (!button) {
      throw new Error('Nie znaleziono przycisku generowania.');
    }

    button.click();
    fixture.detectChanges();
  }

  async function importFile(
    name = 'playlist.json',
    text = JSON.stringify({
      version: 1,
      spotifyTrackIds: dataset.tracks.map((track) => track.id),
    })
  ): Promise<void> {
    const file = new File([], name, { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
    selectFile(file);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function selectFile(file: File | null): void {
    const input = getInput('playlist-dataset-file');
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
    input.dispatchEvent(new Event('change'));
  }

  function getInput(id: string): HTMLInputElement {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(`#${id}`);

    if (!input) {
      throw new Error(`Nie znaleziono pola: ${id}`);
    }

    return input;
  }

  function setTrackCount(value: string): void {
    const input = getInput('playlist-top-track-count');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function setEnergyPreference(value: string): void {
    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector(
      '#playlist-preference-energy'
    );

    if (!select) {
      throw new Error('Nie znaleziono preferencji energii.');
    }

    select.value = value;
    select.dispatchEvent(new Event('input'));
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

  function toggleTrack(trackId: string): void {
    const checkboxes: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.track-selection-toggle input')
    );
    const checkbox = checkboxes.find((input) => input.value === trackId);

    if (!checkbox) {
      throw new Error(`Nie znaleziono checkboxa utworu: ${trackId}`);
    }

    checkbox.click();
    fixture.detectChanges();
  }

  function getSelectedTrackIds(): string[] {
    return fixture.componentInstance['selectedTrackIds']();
  }

  function getResultsComponent(): PlaylistGeneratorResults {
    const results = fixture.debugElement.query(By.directive(PlaylistGeneratorResults));

    if (!results) {
      throw new Error('Nie znaleziono komponentu wyników.');
    }

    return results.injector.get(PlaylistGeneratorResults);
  }

  function getSelectionCount(): string {
    const counter: HTMLElement | null = fixture.nativeElement.querySelector('.selection-count');

    if (!counter) {
      throw new Error('Nie znaleziono licznika wyboru.');
    }

    return counter.textContent.replace(/\s+/g, ' ').trim();
  }
});

function createDataset(): PlaylistDataset {
  return {
    version: 1,
    tracks: ['a', 'b', 'c'].map((id) => createTrack(id.repeat(22))),
  };
}

function createTrack(id: string): PlaylistTrack {
  return {
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
  };
}

function createResult(dataset: PlaylistDataset): GeneratedPlaylist {
  return {
    rankedTracks: [dataset.tracks[2], dataset.tracks[0]].map((track, index) => ({
      track,
      overallMatch: index === 0 ? 1 : 0,
      featureMatches: [
        {
          feature: 'energy',
          level: 'high',
          measurement: track.audioFeatures.energy,
          match: index === 0 ? 1 : 0,
        },
      ],
    })),
    rejectedTracks: [
      {
        track: dataset.tracks[1],
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      },
    ],
  };
}
