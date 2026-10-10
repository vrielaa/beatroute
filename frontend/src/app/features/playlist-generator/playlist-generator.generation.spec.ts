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
  });

  it('enables generation after import without automatically sending a request', async () => {
    await importDataset();

    expect(getGenerateButton().disabled).toBe(false);

    setPreference('energy', 'high');

    expect(getGenerateButton().disabled).toBe(false);
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

  it('shows accepted and rejected counts after successful generation', async () => {
    await importDataset();
    setTempoRange('120', '140');
    generate();

    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();

    expect(getSummary()?.textContent).toContain('Podsumowanie generowania');
    expect(getText()).toContain('Dopuszczone utwory: 1.');
    expect(getText()).toContain('Odrzucone utwory: 1.');
    expect(getGenerationError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
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
    expect(getGenerationError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
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
    expect(getText()).toContain('Generowanie playlisty…');
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
  });

  it('clears a previous result after changing a preference without automatically regenerating', async () => {
    await importDataset();
    generate();
    http.expectOne('/api/playlist-generator/generate').flush(createResult());
    fixture.detectChanges();

    setPreference('energy', 'high');

    expect(getSummary()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    http.expectNone(() => true);
  });

  it('cancels an outdated request after a preference change and generates using the new value', async () => {
    await importDataset();
    generate();
    const previousRequest = http.expectOne('/api/playlist-generator/generate');

    setPreference('energy', 'high');

    expect(previousRequest.cancelled).toBe(true);
    expect(getSummary()).toBeNull();
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
