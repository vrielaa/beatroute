import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import type { GeneratedPlaylist, PlaylistDataset } from './playlist-generator.models';

describe('PlaylistGenerator generation', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('disables generation without a dataset and sends no HTTP request', () => {
    expect(getGenerateButton().disabled).toBe(true);

    getGenerateButton().dispatchEvent(new Event('click'));

    http.expectNone(() => true);
    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
  });

  it('enables generation after import without automatically sending a request', async () => {
    await importDataset();

    expect(getGenerateButton().disabled).toBe(false);

    setPreference('energy', 'high');

    expect(getGenerateButton().disabled).toBe(false);
    expect(getResults()).toBeNull();
    http.expectNone(() => true);
  });

  it('does not send a request when an active requirement is incomplete', async () => {
    await importDataset();
    setTempoEnabled(true);

    expect(getGenerateButton().disabled).toBe(true);

    getGenerateButton().dispatchEvent(new Event('click'));

    http.expectNone(() => true);
  });

  it('blocks generation while a replacement file is being read', async () => {
    await importDataset();
    let finishReading!: (text: string) => void;
    const pendingText = new Promise<string>((resolve) => {
      finishReading = resolve;
    });
    const file = new File([], 'replacement.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => pendingText });

    selectFile(file);
    fixture.detectChanges();

    expect(getGenerateButton().disabled).toBe(true);
    expect(getText()).toContain('Wczytywanie pliku…');
    getGenerateButton().dispatchEvent(new Event('click'));
    http.expectNone(() => true);

    finishReading(JSON.stringify(createDataset()));
    await updateView();

    expect(getGenerateButton().disabled).toBe(false);
  });

  it('posts the imported dataset and selected criteria including all null fields', async () => {
    const dataset = createDataset();
    await importDataset(dataset);
    setTempoRange('120', '140');
    setPreference('energy', 'high');

    generate();

    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      dataset,
      requirements: { tempoRange: { min: 120, max: 140 }, maxSpeechiness: null, maxLiveness: null },
      preferences: {
        energy: 'high',
        danceability: null,
        valence: null,
        acousticness: null,
        instrumentalness: null,
      },
    });
    request.flush(createResult());
  });

  it('shows loading and blocks a second generation while the request is pending', async () => {
    await importDataset();
    generate();

    expect(getGenerateButton().disabled).toBe(true);
    expect(getText()).toContain('Generowanie playlisty…');
    expect(getResults()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.playlist-generation').getAttribute('aria-busy')
    ).toBe('true');

    getGenerateButton().dispatchEvent(new Event('click'));

    const request = http.expectOne('/api/playlist-generator/generate');
    http.expectNone('/api/playlist-generator/generate');
    request.flush(createResult());
    fixture.detectChanges();

    expect(getGenerateButton().disabled).toBe(false);
    expect(getText()).not.toContain('Generowanie playlisty…');
  });

  it('shows the detailed results with counts, ranking and rejections after generation', async () => {
    await importDataset();
    setTempoRange('120', '140');
    generate();

    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();

    expect(getResults()?.textContent).toContain('Wynik generowania');
    expect(getText()).toContain('Dopuszczone utwory: 1.');
    expect(getText()).toContain('Odrzucone utwory: 1.');
    expect(getResultElements('app-playlist-ranked-track')).toHaveLength(1);
    expect(getResultText('app-playlist-ranked-track h3')).toBe('First track');
    expect(getResultText('.ranking-position')).toBe('Pozycja 1');
    expect(getResultText('.track-artists')).toBe('Example artist');
    expect(getResultText('.overall-match-value')).toBe('Bez aktywnych preferencji');
    expect(getResultElements('.rejected-track')).toHaveLength(1);
    expect(getResultText('.rejected-track h4')).toBe('Second track');
    expect(getResultText('.rejection-reasons')).toBe('Tempo (BPM) jest poza wybranym zakresem.');
    expect(getResultElements('.generation-summary')).toHaveLength(1);
    expect(getGenerationError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    http.expectNone(() => true);
  });

  it('treats an empty ranking as a valid result rather than a request error', async () => {
    await importDataset();
    setTempoRange('200', '210');
    generate();

    const response: GeneratedPlaylist = {
      rankedTracks: [],
      rejectedTracks: createDataset().tracks.map((track) => ({
        track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      })),
    };
    http.expectOne('/api/playlist-generator/generate').flush(response);
    fixture.detectChanges();

    expect(getText()).toContain('Dopuszczone utwory: 0.');
    expect(getText()).toContain('Odrzucone utwory: 2.');
    expect(getText()).toContain('Żaden utwór nie spełnia aktywnych wymagań');
    expect(getResultElements('app-playlist-ranked-track')).toHaveLength(0);
    expect(getResultElements('.rejected-track')).toHaveLength(2);
    expect(getResultElements('.rejection-reasons')).toHaveLength(2);
    expect(getGenerationError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
  });

  it('displays zero preference match as an accepted track, preserving the returned ranking', async () => {
    const dataset = createDataset();
    dataset.tracks[0].audioFeatures.energy = 0.801;
    dataset.tracks[1].audioFeatures.energy = 0.2;
    await importDataset(dataset);
    setPreference('energy', 'low');
    generate();

    const response: GeneratedPlaylist = {
      rankedTracks: [
        {
          track: dataset.tracks[1],
          overallMatch: 1,
          featureMatches: [{ feature: 'energy', level: 'low', measurement: 0.2, match: 1 }],
        },
        {
          track: dataset.tracks[0],
          overallMatch: 0,
          featureMatches: [{ feature: 'energy', level: 'low', measurement: 0.801, match: 0 }],
        },
      ],
      rejectedTracks: [],
    };
    http.expectOne('/api/playlist-generator/generate').flush(response);
    fixture.detectChanges();

    expect(
      getResultElements('app-playlist-ranked-track h3').map((element) => element.textContent.trim())
    ).toEqual(['Second track', 'First track']);
    expect(
      getResultElements('.ranking-position').map((element) => element.textContent.trim())
    ).toEqual(['Pozycja 1', 'Pozycja 2']);
    expect(
      getResultElements('.overall-match-value').map((element) => element.textContent.trim())
    ).toEqual(['100%', '0%']);
    expect(
      getResultElements('.preference-measurement').map((element) => element.textContent.trim())
    ).toEqual(['0.2', '0.801']);
    expect(getResultText('.zero-match-hint')).toContain('Utwór spełnia wymagania obowiązkowe.');
    expect(getResultText('.rejections-empty')).toContain('Żaden utwór nie został odrzucony');
    expect(getResultText('.generation-summary')).toContain('Dopuszczone utwory: 2.');
    expect(getResultText('.generation-summary')).toContain('Odrzucone utwory: 0.');
    expect(getGenerationError()).toBeNull();
    http.expectNone(() => true);
  });

  it('displays partial and unavailable measurements from the response without treating them as errors', async () => {
    const dataset = createDataset();
    dataset.tracks[0].audioFeatures.danceability = null;
    dataset.tracks[1].audioFeatures.energy = null;
    dataset.tracks[1].audioFeatures.danceability = null;
    await importDataset(dataset);
    setPreference('energy', 'high');
    setPreference('danceability', 'high');
    generate();

    const response: GeneratedPlaylist = {
      rankedTracks: [
        {
          track: dataset.tracks[0],
          overallMatch: 1,
          featureMatches: [
            { feature: 'energy', level: 'high', measurement: 0.8, match: 1 },
            { feature: 'danceability', level: 'high', measurement: null, match: null },
          ],
        },
        {
          track: dataset.tracks[1],
          overallMatch: null,
          featureMatches: [
            { feature: 'energy', level: 'high', measurement: null, match: null },
            { feature: 'danceability', level: 'high', measurement: null, match: null },
          ],
        },
      ],
      rejectedTracks: [],
    };
    http.expectOne('/api/playlist-generator/generate').flush(response);
    fixture.detectChanges();

    expect(
      getResultElements('.overall-match-value').map((element) => element.textContent.trim())
    ).toEqual(['100%', 'Brak dostępnych pomiarów']);
    expect(
      getResultElements('.measurement-summary').map((element) => element.textContent.trim())
    ).toEqual([
      'Pomiary dostępne dla 1 z 2 aktywnych preferencji.',
      'Pomiary dostępne dla 0 z 2 aktywnych preferencji.',
    ]);
    expect(
      getResultElements('.preference-score').map((element) => element.textContent.trim())
    ).toEqual(['100%', 'Brak oceny', 'Brak oceny', 'Brak oceny']);
    expect(getResultText('.generation-summary')).toContain('Dopuszczone utwory: 2.');
    expect(getGenerationError()).toBeNull();
    http.expectNone(() => true);
  });

  it.each([
    {
      status: 400,
      statusText: 'Bad Request',
      message: 'Sprawdź format zbioru i ustawione kryteria.',
    },
    { status: 413, statusText: 'Payload Too Large', message: 'Przesłany zbiór jest zbyt duży.' },
    {
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Nie udało się wygenerować playlisty. Spróbuj ponownie.',
    },
  ])(
    'shows a safe HTTP $status error and allows retry',
    async ({ status, statusText, message }) => {
      await importDataset();
      generate();

      http
        .expectOne('/api/playlist-generator/generate')
        .flush({ error: { message: 'Technical backend details' } }, { status, statusText });
      fixture.detectChanges();

      expect(getGenerationError()?.textContent).toContain(message);
      expect(getText()).not.toContain('Technical backend details');
      expect(getSummary()).toBeNull();
      expect(getResults()).toBeNull();
      expect(getGenerateButton().disabled).toBe(false);
      expect(getGenerateButton().textContent).toContain('Spróbuj ponownie');
      expect(getText()).toContain('playlist.json');
    }
  );

  it('shows a network error without replacing it with an empty result', async () => {
    await importDataset();
    generate();

    http.expectOne('/api/playlist-generator/generate').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(getGenerationError()?.textContent).toContain(
      'Nie udało się wygenerować playlisty. Spróbuj ponownie.'
    );
    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
  });

  it('clears the previous error and retries with the same dataset and criteria', async () => {
    await importDataset();
    setTempoRange('120', '140');
    generate();
    const failedRequest = http.expectOne('/api/playlist-generator/generate');
    const previousBody = failedRequest.request.body;
    failedRequest.flush({}, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    generate();

    expect(getGenerationError()).toBeNull();
    expect(getText()).toContain('Generowanie playlisty…');
    const retry = http.expectOne('/api/playlist-generator/generate');
    expect(retry.request.body).toEqual(previousBody);
    retry.flush(createResult());
    fixture.detectChanges();

    expect(getSummary()).not.toBeNull();
    expect(getResultText('app-playlist-ranked-track h3')).toBe('First track');
    expect(getResultText('.rejection-reasons')).toContain(
      'Tempo (BPM) jest poza wybranym zakresem.'
    );
    expect(getGenerationError()).toBeNull();
  });

  it('clears a previous result while a new generation is pending', async () => {
    await importDataset();
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();
    expect(getSummary()).not.toBeNull();

    generate();

    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getText()).toContain('Generowanie playlisty…');
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
  });

  it('clears a previous result after changing a preference without automatically regenerating', async () => {
    await importDataset();
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();
    expect(getResults()).not.toBeNull();

    setPreference('energy', 'high');

    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    http.expectNone(() => true);
  });

  it('reuses the imported dataset after changing preferences and requirements without reading the file again', async () => {
    const dataset = createDataset();
    const file = createFile('current-playlist.json', JSON.stringify(dataset));
    const read = vi.spyOn(file, 'text');
    selectFile(file);
    await updateView();
    const criteriaForm = fixture.nativeElement.querySelector('app-playlist-criteria-form');
    setPreference('energy', 'high');
    generate();
    const firstRequest = http.expectOne('/api/playlist-generator/generate');
    const importedDataset = firstRequest.request.body.dataset;
    firstRequest.flush(createResult());
    fixture.detectChanges();

    setPreference('energy', 'low');
    setTempoRange('125', '135');
    await updateView();

    expect(read).toHaveBeenCalledOnce();
    expect(getText()).toContain('current-playlist.json');
    expect(fixture.nativeElement.querySelector('#playlist-selected-file').textContent.trim()).toBe(
      'current-playlist.json'
    );
    expect(getText()).toContain('Liczba utworów: 2');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBe(criteriaForm);
    expect(getResults()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    http.expectNone(() => true);

    generate();
    const nextRequest = http.expectOne('/api/playlist-generator/generate');
    expect(nextRequest.request.body.dataset).toBe(importedDataset);
    expect(nextRequest.request.body).toEqual({
      dataset,
      requirements: { tempoRange: { min: 125, max: 135 }, maxSpeechiness: null, maxLiveness: null },
      preferences: {
        energy: 'low',
        danceability: null,
        valence: null,
        acousticness: null,
        instrumentalness: null,
      },
    });
    nextRequest.flush(createResult());
    fixture.detectChanges();

    expect(getResults()).not.toBeNull();
    expect(read).toHaveBeenCalledOnce();
  });

  it('keeps the current dataset while invalid criteria are corrected without another file selection', async () => {
    const dataset = createDataset();
    const file = createFile('current-playlist.json', JSON.stringify(dataset));
    const read = vi.spyOn(file, 'text');
    selectFile(file);
    await updateView();

    setTempoRange('140', '120');

    expect(getGenerateButton().disabled).toBe(true);
    expect(getText()).toContain('current-playlist.json');
    expect(getText()).toContain('Liczba utworów: 2');
    http.expectNone(() => true);

    setTempoRange('120', '140');
    expect(getGenerateButton().disabled).toBe(false);

    generate();
    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.body.dataset).toEqual(dataset);
    expect(request.request.body.requirements.tempoRange).toEqual({ min: 120, max: 140 });
    expect(read).toHaveBeenCalledOnce();
    request.flush(createResult());
  });

  it('cancels an outdated request after a preference change and generates using the new value', async () => {
    await importDataset();
    generate();
    const previousRequest = http.expectOne('/api/playlist-generator/generate');

    setPreference('energy', 'high');

    expect(previousRequest.cancelled).toBe(true);
    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerationError()).toBeNull();
    expect(getText()).not.toContain('Generowanie playlisty…');
    expect(getGenerateButton().disabled).toBe(false);

    generate();
    const nextRequest = http.expectOne('/api/playlist-generator/generate');
    expect(nextRequest.request.body.preferences.energy).toBe('high');
    nextRequest.flush(createResult());
  });

  it('cancels generation and disables the button when requirements become incomplete', async () => {
    await importDataset();
    generate();
    const request = http.expectOne('/api/playlist-generator/generate');

    setTempoEnabled(true);

    expect(request.cancelled).toBe(true);
    expect(getGenerateButton().disabled).toBe(true);
    expect(getText()).not.toContain('Generowanie playlisty…');
    expect(getSummary()).toBeNull();
  });

  it('cancels generation when another file is imported and uses the replacement dataset', async () => {
    await importDataset();
    generate();
    const request = http.expectOne('/api/playlist-generator/generate');
    const replacement = createDataset();
    replacement.tracks[0].id = 'replacement-track';

    await importDataset(replacement, 'replacement.json');

    expect(request.cancelled).toBe(true);
    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerationError()).toBeNull();
    expect(getText()).not.toContain('Generowanie playlisty…');

    generate();
    const nextRequest = http.expectOne('/api/playlist-generator/generate');
    expect(nextRequest.request.body.dataset).toEqual(replacement);
    nextRequest.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('clears the previous result and disables generation after an invalid replacement import', async () => {
    await importDataset();
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();

    selectFile(createFile('broken.json', '{'));
    await updateView();

    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerationError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(true);
    expect(getText()).toContain('Plik nie zawiera poprawnego JSON-a');
  });

  it('resets visible criteria and the previous result when a valid file replaces the dataset', async () => {
    await importDataset();
    setTempoRange('120', '140');
    setPreference('energy', 'high');
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();

    await importDataset(createDataset(), 'replacement.json');

    expect(getSummary()).toBeNull();
    expect(getResults()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('#playlist-tempo-min')).toBeNull();
    expect(fixture.nativeElement.querySelector('#playlist-preference-energy').value).toBe('');

    generate();
    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.body.requirements).toEqual({
      tempoRange: null,
      maxSpeechiness: null,
      maxLiveness: null,
    });
    expect(request.request.body.preferences.energy).toBeNull();
    request.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('preserves the pending request when file selection is cancelled', async () => {
    await importDataset();
    generate();
    const request = http.expectOne('/api/playlist-generator/generate');

    selectFile(null);
    fixture.detectChanges();

    expect(request.cancelled).toBe(false);
    expect(getGenerateButton().disabled).toBe(true);
    request.flush(createResult());
    fixture.detectChanges();
    expect(getSummary()).not.toBeNull();
  });

  it('preserves the displayed detailed result when file selection is cancelled', async () => {
    await importDataset();
    setTempoRange('120', '140');
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();
    const previousResults = getResults();
    expect(previousResults).not.toBeNull();

    selectFile(null);
    fixture.detectChanges();

    expect(getResults()).toBe(previousResults);
    expect(getResultText('app-playlist-ranked-track h3')).toBe('First track');
    expect(getResultText('.rejected-track h4')).toBe('Second track');
    expect(getGenerationError()).toBeNull();
    http.expectNone(() => true);
  });

  it('uses the current dataset and new criteria after cancelling the file picker', async () => {
    const dataset = createDataset();
    const file = createFile('current-playlist.json', JSON.stringify(dataset));
    const read = vi.spyOn(file, 'text');
    selectFile(file);
    await updateView();
    selectFile(null);
    await updateView();

    setPreference('danceability', 'high');
    generate();

    const request = http.expectOne('/api/playlist-generator/generate');
    expect(request.request.body.dataset).toEqual(dataset);
    expect(request.request.body.preferences.danceability).toBe('high');
    expect(getText()).toContain('current-playlist.json');
    expect(read).toHaveBeenCalledOnce();
    request.flush(createResult());
  });

  it('cancels the pending HTTP request when the component is destroyed', async () => {
    await importDataset();
    generate();
    const request = http.expectOne('/api/playlist-generator/generate');

    fixture.destroy();

    expect(request.cancelled).toBe(true);
  });

  function getGenerateButton(): HTMLButtonElement {
    const button = fixture.nativeElement.querySelector('#playlist-generate');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Nie znaleziono przycisku generowania playlisty');
    }
    return button;
  }

  function getInput(id: string): HTMLInputElement {
    const input = fixture.nativeElement.querySelector(`#${id}`);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Nie znaleziono pola: ${id}`);
    }
    return input;
  }

  function generate(): void {
    getGenerateButton().click();
    fixture.detectChanges();
  }

  function setTempoEnabled(enabled: boolean): void {
    const input = getInput('playlist-tempo-enabled');
    input.checked = enabled;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setTempoRange(min: string, max: string): void {
    setTempoEnabled(true);
    for (const [id, value] of [
      ['playlist-tempo-min', min],
      ['playlist-tempo-max', max],
    ]) {
      const input = getInput(id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }
  }

  function setPreference(feature: string, value: string): void {
    const select = fixture.nativeElement.querySelector(`#playlist-preference-${feature}`);
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error(`Nie znaleziono preferencji: ${feature}`);
    }
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function selectFile(file: File | null): void {
    const input = getInput('playlist-dataset-file');
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function importDataset(dataset = createDataset(), name = 'playlist.json'): Promise<void> {
    selectFile(createFile(name, JSON.stringify(dataset)));
    await updateView();
  }

  async function updateView(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function getSummary(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.generation-summary');
  }

  function getResults(): HTMLElement | null {
    return fixture.nativeElement.querySelector('app-playlist-generator-results');
  }

  function getResultElements(selector: string): HTMLElement[] {
    const results = getResults();

    if (!results) {
      throw new Error('Nie znaleziono widoku wyników generatora');
    }

    return Array.from(results.querySelectorAll(selector));
  }

  function getResultText(selector: string): string {
    const element = getResultElements(selector)[0];

    if (!element) {
      throw new Error(`Nie znaleziono elementu wyników generatora: ${selector}`);
    }

    return element.textContent.replace(/\s+/g, ' ').trim();
  }

  function getGenerationError(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.generation-error');
  }
});

function createFile(name: string, text: string): File {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(text) });
  return file;
}

function createDataset(): PlaylistDataset {
  const track = {
    id: 'track-1',
    name: 'First track',
    artists: ['Example artist'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: null,
      instrumentalness: 0,
      speechiness: 0.1,
      liveness: null,
    },
  };
  return {
    version: 1,
    tracks: [
      track,
      {
        ...track,
        id: 'track-2',
        name: 'Second track',
        audioFeatures: { ...track.audioFeatures, tempo: 150 },
      },
    ],
  };
}

function createResult(): GeneratedPlaylist {
  const dataset = createDataset();
  return {
    rankedTracks: [{ track: dataset.tracks[0], overallMatch: null, featureMatches: [] }],
    rejectedTracks: [
      { track: dataset.tracks[1], reasons: [{ feature: 'tempo', code: 'outside-range' }] },
    ],
  };
}
