import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import type { PreparedPlaylistDataset } from './playlist-generator.models';

describe('PlaylistGenerator preparation and progress', () => {
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

  afterEach(() => {
    vi.useRealTimers();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('does nothing remotely before clicking Generate, including after criteria changes', async () => {
    await importIds();
    setEnergyPreference('high');

    expect(getGenerateButton().disabled).toBe(false);
    expect(getProgress()).toBeNull();
    expect(getText()).toContain('Liczba identyfikatorów: 2');
    expect(getText()).not.toContain('Liczba utworów:');
    http.expectNone(() => true);
  });

  it('starts preparation only on click and does not start analysis before the data arrives', async () => {
    await importIds();
    startGeneration();

    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    expect(preparation.request.method).toBe('POST');
    expect(preparation.request.body).toEqual(createTrackIdsFile());
    expect(preparation.request.withCredentials).toBe(true);
    expect(getText()).toContain('Etap 1/3');
    expect(getText()).toContain('Pobieranie danych');
    expect(getText()).toContain('metadane ze Spotify i cechy audio z ReccoBeats');
    expect(getGenerateButton().disabled).toBe(true);
    expect(getProgressbar().getAttribute('aria-valuenow')).toBe('0');
    expect(
      fixture.nativeElement.querySelector('.playlist-generation').getAttribute('aria-busy')
    ).toBe('true');
    http.expectNone('/api/playlist-generator/generate');

    getGenerateButton().dispatchEvent(new Event('click'));
    http.expectNone('/api/playlist-generator/prepare-dataset');
    preparation.flush(createPreparedDataset());
    http
      .expectOne('/api/playlist-generator/generate')
      .flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('advances from preparation to analysis and completion only after the respective responses', async () => {
    await importIds();
    setEnergyPreference('high');
    const form = fixture.nativeElement.querySelector('app-playlist-criteria-form');
    startGeneration();
    const prepared = createPreparedDataset();

    http.expectOne('/api/playlist-generator/prepare-dataset').flush(prepared);
    fixture.detectChanges();

    expect(getText()).toContain('Etap 2/3');
    expect(getProgressbar().getAttribute('aria-valuenow')).toBe('2');
    expect(getText()).toContain('Analiza i ranking');
    expect(getText()).toContain('wymagania i');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBe(form);
    expect(getGenerateButton().disabled).toBe(true);
    const analysis = http.expectOne('/api/playlist-generator/generate');
    expect(analysis.request.body.dataset).toEqual(prepared.dataset);
    expect(analysis.request.body.preferences.energy).toBe('high');

    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();

    expect(getText()).toContain('Etap 3/3');
    expect(getProgressbar().getAttribute('aria-valuenow')).toBe('2');
    expect(getText()).toContain('Wynik jest gotowy');
    expect(getGenerateButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    http.expectNone(() => true);
  });

  it('does not advance the progress based on elapsed time while API preparation is pending', async () => {
    await importIds();
    startGeneration();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    vi.useFakeTimers();

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();

    expect(getText()).toContain('Etap 1/3');
    expect(getProgressbar().getAttribute('aria-valuenow')).toBe('0');
    expect(getText()).not.toContain('Wynik jest gotowy');
    http.expectNone('/api/playlist-generator/generate');
    vi.useRealTimers();
    preparation.flush(createPreparedDataset());
    http
      .expectOne('/api/playlist-generator/generate')
      .flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('sends trimmed unique IDs without extra metadata or a token from the file', async () => {
    const ids = createTrackIdsFile().spotifyTrackIds;
    await importIds({
      version: 1,
      spotifyTrackIds: [` ${ids[0]} `, ids[1], ids[0]],
      tracks: [{ name: 'Not required' }],
      accessToken: 'not-a-session-token',
    });
    http.expectNone(() => true);
    startGeneration();

    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    expect(preparation.request.body).toEqual(createTrackIdsFile());
    preparation.flush(createPreparedDataset());
    http
      .expectOne('/api/playlist-generator/generate')
      .flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('shows skipped tracks and missing measurements, then analyzes only the prepared tracks', async () => {
    const prepared = createPreparedDataset();
    prepared.dataset.tracks[0].audioFeatures.energy = null;
    prepared.skippedTracks = [
      { spotifyId: 'A'.repeat(22), reason: 'metadata-unavailable' },
      { spotifyId: 'B'.repeat(22), reason: 'audio-features-unavailable' },
    ];
    prepared.incompleteTracks = [
      { spotifyId: prepared.dataset.tracks[0].id, missingFeatures: ['energy'] },
    ];
    await importIds();
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(prepared);
    fixture.detectChanges();

    expect(getText()).toContain('Liczba utworów: 2');
    expect(getText()).toContain('Pominięte utwory: 2');
    expect(getText()).toContain('Utwory z niepełnymi pomiarami: 1');
    expect(getText()).toContain('Brak metadanych Spotify');
    expect(getText()).toContain('Brak cech audio');
    expect(getText()).toContain('brak: Energia');
    const analysis = http.expectOne('/api/playlist-generator/generate');
    expect(analysis.request.body.dataset).toEqual(prepared.dataset);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('stops before analysis for an empty dataset without reporting an API error or completed progress', async () => {
    const prepared = createPreparedDataset();
    prepared.dataset.tracks = [];
    prepared.skippedTracks = createTrackIdsFile().spotifyTrackIds.map((spotifyId) => ({
      spotifyId,
      reason: 'audio-features-unavailable',
    }));
    await importIds();
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(prepared);
    fixture.detectChanges();

    expect(getText()).toContain('Nie znaleziono utworów z metadanymi i użytecznymi pomiarami');
    expect(getText()).toContain('Pominięte utwory: 2');
    expect(getText()).not.toContain('Wynik jest gotowy');
    expect(getError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(true);
    expect(getProgressbar().getAttribute('aria-valuenow')).toBe('2');
    expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
    getGenerateButton().dispatchEvent(new Event('click'));
    http.expectNone(() => true);
  });

  it.each([
    { status: 400, message: 'Sprawdź format pliku i identyfikatory Spotify.' },
    { status: 401, message: 'Połącz ponownie konto Spotify' },
    { status: 403, message: 'Spotify odmówiło dostępu' },
    { status: 413, message: 'Plik jest zbyt duży.' },
    { status: 429, message: 'Przekroczono limit zapytań' },
    { status: 500, message: 'Nie udało się przygotować zbioru.' },
    { status: 502, message: 'Nie udało się pobrać danych ze Spotify lub ReccoBeats.' },
    { status: 503, message: 'Nie udało się pobrać danych ze Spotify lub ReccoBeats.' },
    { status: 504, message: 'Pobieranie danych trwało zbyt długo.' },
  ])(
    'stops on HTTP $status and retries only after another click without rereading the file',
    async ({ status, message }) => {
      const read = await importIds();
      setEnergyPreference('high');
      startGeneration();
      http
        .expectOne('/api/playlist-generator/prepare-dataset')
        .flush(
          { error: { message: 'Private provider diagnostic' } },
          { status, statusText: 'Failure' }
        );
      fixture.detectChanges();

      expect(getError()?.textContent).toContain(message);
      expect(getText()).not.toContain('Private provider diagnostic');
      expect(getText()).toContain('Etap 1/3');
      expect(getText()).toContain('Proces zatrzymany');
      expect(getText()).not.toContain('Liczba utworów:');
      expect(getGenerateButton().disabled).toBe(false);
      expect(getGenerateButton().textContent).toContain('Spróbuj ponownie');
      expect(fixture.nativeElement.querySelector('.is-running')).toBeNull();
      http.expectNone(() => true);

      startGeneration();
      expect(getError()).toBeNull();
      http.expectOne('/api/playlist-generator/prepare-dataset').flush(createPreparedDataset());
      const analysis = http.expectOne('/api/playlist-generator/generate');
      expect(analysis.request.body.preferences.energy).toBe('high');
      analysis.flush({ rankedTracks: [], rejectedTracks: [] });
      fixture.detectChanges();

      expect(read).toHaveBeenCalledOnce();
      expect(getText()).toContain('ids.json');
      expect(getText()).toContain('Etap 3/3');
    }
  );

  it('distinguishes a failed connection from an empty dataset', async () => {
    await importIds();
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(getError()?.textContent).toContain('Nie udało się połączyć z backendem');
    expect(getText()).not.toContain('Nie znaleziono utworów');
    expect(getGenerateButton().disabled).toBe(false);
    http.expectNone('/api/playlist-generator/generate');
  });

  it('uses Retry-After in the rate-limit message', async () => {
    await importIds();
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      }
    );
    fixture.detectChanges();

    expect(getError()?.textContent?.trim()).toBe('Ponów pobieranie za 30 s.');
  });

  it.each([null, '0', ' 0 ', '', ' ', 'not-a-number', '-1', '1.5', 'Infinity'])(
    'uses a generic rate-limit message for Retry-After %j without showing zero seconds',
    async (header) => {
      await importIds();
      startGeneration();
      http.expectOne('/api/playlist-generator/prepare-dataset').flush(
        {},
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: header === null ? {} : { 'Retry-After': header },
        }
      );
      fixture.detectChanges();

      expect(getError()?.textContent?.trim()).toBe('Przekroczono limit zapytań. Spróbuj później.');
      expect(getText()).not.toContain('za 0 s.');
      http.expectNone(() => true);
    }
  );

  it('cancels preparation on file replacement and waits for another Generate click', async () => {
    await importIds();
    startGeneration();
    const previous = http.expectOne('/api/playlist-generator/prepare-dataset');

    await importIds(createTrackIdsFile(), 'replacement.json');

    expect(previous.cancelled).toBe(true);
    expect(getProgress()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
    expect(getText()).toContain('replacement.json');
    http.expectNone(() => true);
  });

  it('cancels preparation when criteria change without starting a new request', async () => {
    await importIds();
    startGeneration();
    const previous = http.expectOne('/api/playlist-generator/prepare-dataset');

    setEnergyPreference('low');

    expect(previous.cancelled).toBe(true);
    expect(getProgress()).toBeNull();
    http.expectNone(() => true);
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(createPreparedDataset());
    const analysis = http.expectOne('/api/playlist-generator/generate');
    expect(analysis.request.body.preferences.energy).toBe('low');
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('preserves preparation when the file picker is cancelled', async () => {
    await importIds();
    startGeneration();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    selectFile(null);

    expect(preparation.cancelled).toBe(false);
    preparation.flush(createPreparedDataset());
    http
      .expectOne('/api/playlist-generator/generate')
      .flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
    expect(getText()).toContain('ids.json');
    expect(getText()).toContain('Etap 3/3');
  });

  it('cancels preparation when the component is destroyed without starting analysis', async () => {
    await importIds();
    startGeneration();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');

    fixture.destroy();

    expect(preparation.cancelled).toBe(true);
    http.expectNone('/api/playlist-generator/generate');
  });

  it('starts directly at analysis with cached data and never refetches on criteria changes', async () => {
    const read = await importIds();
    startGeneration();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(createPreparedDataset());
    const firstAnalysis = http.expectOne('/api/playlist-generator/generate');
    const cachedDataset = firstAnalysis.request.body.dataset;
    firstAnalysis.flush({ rankedTracks: [], rejectedTracks: [] });
    setEnergyPreference('low');

    expect(getProgress()).toBeNull();
    http.expectNone(() => true);
    startGeneration();

    expect(getText()).toContain('Etap 2/3');
    const nextAnalysis = http.expectOne('/api/playlist-generator/generate');
    expect(nextAnalysis.request.body.dataset).toBe(cachedDataset);
    expect(nextAnalysis.request.body.preferences.energy).toBe('low');
    expect(read).toHaveBeenCalledOnce();
    http.expectNone('/api/playlist-generator/prepare-dataset');
    nextAnalysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  async function importIds(value: unknown = createTrackIdsFile(), name = 'ids.json') {
    const file = new File([JSON.stringify(value)], name, { type: 'application/json' });
    const read = vi.fn().mockResolvedValue(JSON.stringify(value));
    Object.defineProperty(file, 'text', { value: read });
    selectFile(file);
    await fixture.whenStable();
    fixture.detectChanges();
    return read;
  }

  function selectFile(file: File | null): void {
    const input = fixture.nativeElement.querySelector('#playlist-dataset-file');
    if (!(input instanceof HTMLInputElement)) throw new Error('Nie znaleziono pola wyboru pliku');
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function startGeneration(): void {
    getGenerateButton().click();
    fixture.detectChanges();
  }

  function setEnergyPreference(value: string): void {
    const select = fixture.nativeElement.querySelector('#playlist-preference-energy');
    if (!(select instanceof HTMLSelectElement))
      throw new Error('Nie znaleziono preferencji energii');
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function getGenerateButton(): HTMLButtonElement {
    const button = fixture.nativeElement.querySelector('#playlist-generate');
    if (!(button instanceof HTMLButtonElement))
      throw new Error('Nie znaleziono przycisku generowania');
    return button;
  }

  function getProgress(): HTMLElement | null {
    return fixture.nativeElement.querySelector('app-playlist-generation-progress');
  }

  function getProgressbar(): HTMLElement {
    const progressbar = getProgress()?.querySelector('[role="progressbar"]');
    if (!(progressbar instanceof HTMLElement))
      throw new Error('Nie znaleziono postępu generowania');
    return progressbar;
  }

  function getError(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.generation-error');
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});

function createTrackIdsFile() {
  return { version: 1, spotifyTrackIds: ['3sNVsP50132BTNlImLx70i', '4U4LEUWV8sFtos5PdjfDA7'] };
}

function createPreparedDataset(): PreparedPlaylistDataset {
  const track = {
    id: '3sNVsP50132BTNlImLx70i',
    name: 'First track',
    artists: ['Example artist'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0,
      speechiness: 0.1,
      liveness: 0.2,
    },
  };
  return {
    dataset: {
      version: 1,
      tracks: [track, { ...track, id: '4U4LEUWV8sFtos5PdjfDA7', name: 'Second track' }],
    },
    skippedTracks: [],
    incompleteTracks: [],
  };
}
