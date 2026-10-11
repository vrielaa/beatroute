import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import type { PlaylistDataset, PreparedPlaylistDataset } from './playlist-generator.models';

describe('PlaylistGenerator file import', () => {
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
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows a JSON file input with format guidance before importing', () => {
    const input = getInput();

    expect(input.accept).toBe('.json,application/json');
    expect(input.hidden).toBe(true);
    expect(input.multiple).toBe(false);
    expect(input.disabled).toBe(false);
    expect(getChooseButton().disabled).toBe(false);
    expect(getChooseButton().textContent?.trim()).toBe('Wybierz plik');
    expect(getSelectedFileName()).toBe('Nie wybrano pliku');
    expect(getText()).toContain('1–500 identyfikatorami');
    expect(getText()).toContain('spotifyTrackIds');
    expect(getText()).toContain('połączenia konta Spotify');
    expect(getStatus()).toBeNull();
    expect(getError()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
  });

  it('prepares IDs once and then shows the file name and available track count', async () => {
    const { file, read } = createFile('playlist.json', JSON.stringify(createTrackIdsFile()));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await completePreparation();

    expect(read).toHaveBeenCalledOnce();
    expect(getStatus()?.textContent).toContain('playlist.json');
    expect(getText()).toContain('Liczba utworów: 2');
    expect(getError()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
    expect(getInput().hidden).toBe(true);
    expect(getSelectedFileName()).toBe('playlist.json');
    expect(getChooseButton().textContent?.trim()).toBe('Zmień plik');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).not.toBeNull();
    http.expectNone(() => true);
  });

  it('preserves the loaded dataset when file selection is cancelled', async () => {
    const { file } = createFile('playlist.json', JSON.stringify(createTrackIdsFile()));
    selectFile(file);
    await completePreparation();
    const previousStatus = getStatus()?.textContent;

    selectFile(null);
    await updateView();

    expect(getStatus()?.textContent).toBe(previousStatus);
    expect(getInput().disabled).toBe(false);
    expect(getSelectedFileName()).toBe('playlist.json');
    expect(getChooseButton().textContent?.trim()).toBe('Zmień plik');
  });

  it('preserves the existing error when file selection is cancelled', async () => {
    const { file } = createFile('broken.json', '{');
    selectFile(file);
    await updateView();

    selectFile(null);
    await updateView();

    expect(getError()?.textContent).toBe('Plik nie zawiera poprawnego JSON-a');
  });

  it('shows a syntax error and removes the previously imported dataset and name', async () => {
    const original = createFile('original.json', JSON.stringify(createTrackIdsFile()));
    selectFile(original.file);
    await completePreparation();
    expect(getStatus()).not.toBeNull();
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    const broken = createFile('broken.json', '{ invalid json');
    selectFile(broken.file);
    await updateView();

    expect(getError()?.textContent).toBe('Plik nie zawiera poprawnego JSON-a');
    expect(getStatus()).toBeNull();
    expect(getText()).not.toContain('original.json');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
    expect(getText()).not.toContain('broken.json');
    expect(getSelectedFileName()).toBe('Nie wybrano pliku');
    expect(getChooseButton().textContent?.trim()).toBe('Wybierz plik');
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('shows the parser error for a JSON file with an invalid dataset structure', async () => {
    const { file } = createFile(
      'invalid.json',
      JSON.stringify({ version: 2, spotifyTrackIds: [] })
    );
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();

    expect(getError()?.textContent).toBe(
      'Nieobsługiwana wersja pliku: pole version musi mieć wartość 1'
    );
    expect(getStatus()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('shows a readable message when file reading fails', async () => {
    const { file, read } = createFile('unreadable.json', '');
    read.mockRejectedValue(new Error('Technical read failure'));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();

    expect(getError()?.textContent).toBe('Nie udało się odczytać pliku');
    expect(getText()).not.toContain('Technical read failure');
    expect(getStatus()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('clears the previous error after importing a corrected file', async () => {
    const invalid = createFile('playlist.json', '{');
    selectFile(invalid.file);
    await updateView();
    expect(getError()).not.toBeNull();

    const corrected = createFile('playlist.json', JSON.stringify(createTrackIdsFile()));
    selectFile(corrected.file);
    await completePreparation();

    expect(getError()).toBeNull();
    expect(getStatus()?.textContent).toContain('playlist.json');
  });

  it('disables the input and shows loading only while the file is being read', async () => {
    const original = createFile('original.json', JSON.stringify(createTrackIdsFile()));
    selectFile(original.file);
    await completePreparation();
    const pendingText = createPendingRead();
    const { file, read } = createFile('replacement.json', '');
    read.mockReturnValue(pendingText.promise);

    selectFile(file);
    await updateView();

    expect(getInput().disabled).toBe(true);
    expect(getChooseButton().disabled).toBe(true);
    expect(getSelectedFileName()).toBe('Wczytywanie pliku…');
    expect(getStatus()?.textContent).toBe('Wczytywanie pliku…');
    expect(getText()).not.toContain('original.json');
    expect(getError()).toBeNull();

    pendingText.resolve(JSON.stringify(createTrackIdsFile()));
    await completePreparation();

    expect(getInput().disabled).toBe(false);
    expect(getStatus()?.textContent).toContain('replacement.json');
    expect(getChooseButton().disabled).toBe(false);
    expect(getSelectedFileName()).toBe('replacement.json');
    expect(getText()).not.toContain('Wczytywanie pliku…');
  });

  it('ignores a second import while the first read is pending', async () => {
    const pendingText = createPendingRead();
    const first = createFile('first.json', '');
    first.read.mockReturnValue(pendingText.promise);
    selectFile(first.file);
    await updateView();

    const second = createFile('second.json', JSON.stringify(createTrackIdsFile()));
    selectFile(second.file);
    await updateView();

    expect(second.read).not.toHaveBeenCalled();
    expect(getStatus()?.textContent).toBe('Wczytywanie pliku…');

    pendingText.resolve(JSON.stringify(createTrackIdsFile()));
    await completePreparation();

    expect(getStatus()?.textContent).toContain('first.json');
    expect(getText()).not.toContain('second.json');
    expect(getInput().disabled).toBe(false);
  });

  it('allows the same file to be selected again after completion', async () => {
    const { file, read } = createFile('playlist.json', JSON.stringify(createTrackIdsFile()));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await completePreparation();
    selectFile(file);
    await completePreparation();

    expect(read).toHaveBeenCalledTimes(2);
    expect(resetInput).toHaveBeenCalledTimes(2);
    expect(resetInput).toHaveBeenLastCalledWith('');
    expect(getStatus()?.textContent).toContain('playlist.json');
    expect(getSelectedFileName()).toBe('playlist.json');
  });

  it('opens the native file picker through the visible button without importing data', () => {
    const openPicker = vi.spyOn(getInput(), 'click');

    getChooseButton().click();

    expect(openPicker).toHaveBeenCalledOnce();
    expect(getSelectedFileName()).toBe('Nie wybrano pliku');
    expect(getStatus()).toBeNull();
    http.expectNone(() => true);
  });

  it('shows API preparation separately from file reading and blocks generation', async () => {
    selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    fixture.detectChanges();

    expect(getStatus()?.textContent).toBe('Pobieranie metadanych i cech audio…');
    expect(getSelectedFileName()).toBe('ids.json');
    expect(getInput().disabled).toBe(false);
    expect(getChooseButton().disabled).toBe(false);
    expect(getGenerateButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.dataset-import').getAttribute('aria-busy')).toBe(
      'true'
    );
    getGenerateButton().dispatchEvent(new Event('click'));
    http.expectNone('/api/playlist-generator/generate');
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(createPreparedDataset());
    await updateView();

    expect(getGenerateButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.dataset-import').getAttribute('aria-busy')).toBe(
      'false'
    );
  });

  it('trims and deduplicates IDs before sending them to the backend', async () => {
    const ids = createTrackIdsFile().spotifyTrackIds;
    const { file } = createFile(
      'ids.json',
      JSON.stringify({
        version: 1,
        spotifyTrackIds: [` ${ids[0]} `, ids[1], ids[0]],
        tracks: [{ name: 'Not required' }],
        accessToken: 'not-a-session-token',
      })
    );
    selectFile(file);
    await completePreparation();

    expect(getError()).toBeNull();
    http.expectNone(() => true);
  });

  it('rejects the previous full-file format rather than requesting API data for it', async () => {
    selectFile(createFile('old-format.json', JSON.stringify(createDataset())).file);
    await updateView();

    expect(getError()?.textContent).toBe('Pole spotifyTrackIds musi być tablicą');
    expect(getRetryButton()).toBeNull();
    expect(getGenerateButton().disabled).toBe(true);
    http.expectNone(() => true);
  });

  it('shows skipped tracks and incomplete measurements without treating them as a request error', async () => {
    const prepared = createPreparedDataset();
    prepared.dataset.tracks[0].audioFeatures.energy = null;
    prepared.skippedTracks = [
      { spotifyId: 'A'.repeat(22), reason: 'metadata-unavailable' },
      { spotifyId: 'B'.repeat(22), reason: 'audio-features-unavailable' },
    ];
    prepared.incompleteTracks = [
      { spotifyId: prepared.dataset.tracks[0].id, missingFeatures: ['energy'] },
    ];
    selectFile(createFile('partial.json', JSON.stringify(createTrackIdsFile())).file);
    await completePreparation(prepared);

    expect(getText()).toContain('Liczba utworów: 2');
    expect(getText()).toContain('Pominięte utwory: 2');
    expect(getText()).toContain('Utwory z niepełnymi pomiarami: 1');
    expect(getText()).toContain('Brak metadanych Spotify');
    expect(getText()).toContain('Brak cech audio');
    expect(getText()).toContain('brak: Energia');
    expect(getError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(false);
  });

  it('distinguishes an empty prepared dataset from an API failure and disallows generation', async () => {
    const prepared = createPreparedDataset();
    prepared.dataset.tracks = [];
    prepared.skippedTracks = createTrackIdsFile().spotifyTrackIds.map((spotifyId) => ({
      spotifyId,
      reason: 'audio-features-unavailable',
    }));
    selectFile(createFile('unavailable.json', JSON.stringify(createTrackIdsFile())).file);
    await completePreparation(prepared);

    expect(getText()).toContain('Nie znaleziono utworów z metadanymi i użytecznymi pomiarami');
    expect(getText()).toContain('Pominięte utwory: 2');
    expect(getError()).toBeNull();
    expect(getGenerateButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
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
    'shows a safe HTTP $status preparation error and preserves IDs for retry',
    async ({ status, message }) => {
      const { file, read } = createFile('retry.json', JSON.stringify(createTrackIdsFile()));
      selectFile(file);
      await Promise.resolve();
      const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
      preparation.flush(
        { error: { message: 'Private provider diagnostic' } },
        { status, statusText: 'Failure' }
      );
      await updateView();

      expect(getError()?.textContent).toContain(message);
      expect(getText()).not.toContain('Private provider diagnostic');
      expect(getSelectedFileName()).toBe('retry.json');
      expect(getStatus()).toBeNull();
      expect(getGenerateButton().disabled).toBe(true);
      expect(getRetryButton()).not.toBeNull();

      getRetryButton()?.click();
      fixture.detectChanges();
      expect(getError()).toBeNull();
      expect(getStatus()?.textContent).toContain('Pobieranie metadanych');
      const retry = http.expectOne('/api/playlist-generator/prepare-dataset');
      expect(retry.request.body).toEqual(createTrackIdsFile());
      retry.flush(createPreparedDataset());
      await updateView();

      expect(read).toHaveBeenCalledOnce();
      expect(getGenerateButton().disabled).toBe(false);
      expect(getSelectedFileName()).toBe('retry.json');
      http.expectNone('/api/playlist-generator/generate');
    }
  );

  it('shows a network error rather than reporting that no tracks were found', async () => {
    selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    http.expectOne('/api/playlist-generator/prepare-dataset').error(new ProgressEvent('error'));
    await updateView();

    expect(getError()?.textContent).toContain('Nie udało się połączyć z backendem');
    expect(getText()).not.toContain('Nie znaleziono utworów');
    expect(getRetryButton()).not.toBeNull();
  });

  it('uses Retry-After in the rate-limit message', async () => {
    selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    http.expectOne('/api/playlist-generator/prepare-dataset').flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      }
    );
    await updateView();

    expect(getError()?.textContent).toContain('Ponów pobieranie za 30 s.');
  });

  it.each(['', ' ', 'not-a-number', '-1', '1.5', 'Infinity'])(
    'ignores an invalid Retry-After header %j',
    async (header) => {
      selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
      await Promise.resolve();
      http.expectOne('/api/playlist-generator/prepare-dataset').flush(
        {},
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': header },
        }
      );
      await updateView();

      expect(getError()?.textContent).toContain('Ponów pobieranie później.');
    }
  );

  it('cancels outdated preparation when another file is selected', async () => {
    selectFile(createFile('first.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    const previous = http.expectOne('/api/playlist-generator/prepare-dataset');

    selectFile(createFile('replacement.json', JSON.stringify(createTrackIdsFile())).file);
    await completePreparation();

    expect(previous.cancelled).toBe(true);
    expect(getSelectedFileName()).toBe('replacement.json');
    expect(getText()).not.toContain('first.json');
  });

  it('preserves pending preparation when the file picker is cancelled', async () => {
    selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    selectFile(null);

    expect(preparation.cancelled).toBe(false);
    preparation.flush(createPreparedDataset());
    await updateView();
    expect(getSelectedFileName()).toBe('ids.json');
  });

  it('cancels preparation when the component is destroyed', async () => {
    selectFile(createFile('ids.json', JSON.stringify(createTrackIdsFile())).file);
    await Promise.resolve();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');

    fixture.destroy();

    expect(preparation.cancelled).toBe(true);
  });

  it('does not start HTTP after destruction while a file read is pending', async () => {
    const pending = createPendingRead();
    const { file, read } = createFile('ids.json', '');
    read.mockReturnValue(pending.promise);
    selectFile(file);
    fixture.destroy();

    pending.resolve(JSON.stringify(createTrackIdsFile()));
    await Promise.resolve();

    http.expectNone(() => true);
  });

  async function completePreparation(prepared = createPreparedDataset()): Promise<void> {
    await Promise.resolve();
    const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
    expect(preparation.request.method).toBe('POST');
    expect(preparation.request.withCredentials).toBe(true);
    expect(preparation.request.body).toEqual(createTrackIdsFile());
    preparation.flush(prepared);
    await updateView();
  }

  function getGenerateButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('#playlist-generate');
  }

  function getRetryButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('#playlist-retry-preparation');
  }

  function getChooseButton(): HTMLButtonElement {
    const button = fixture.nativeElement.querySelector('#playlist-choose-file');

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Nie znaleziono przycisku wyboru pliku');
    }

    return button;
  }

  function getSelectedFileName(): string {
    const name = fixture.nativeElement.querySelector('#playlist-selected-file');

    if (!(name instanceof HTMLElement)) {
      throw new Error('Nie znaleziono nazwy wybranego pliku');
    }

    return name.textContent?.trim() ?? '';
  }

  function getInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#playlist-dataset-file');
  }

  function selectFile(file: File | null): void {
    const input = getInput();
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: file ? [file] : [],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function updateView(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function getStatus(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="status"]');
  }

  function getError(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="alert"]');
  }
});

function createFile(name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  const read = vi.fn<() => Promise<string>>().mockResolvedValue(text);
  Object.defineProperty(file, 'text', { value: read });

  return { file, read };
}

function createPendingRead() {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createDataset(): PlaylistDataset {
  const track = {
    id: '3sNVsP50132BTNlImLx70i',
    name: 'Track 1',
    artists: ['Artist A'],
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
    tracks: [track, { ...track, id: '4U4LEUWV8sFtos5PdjfDA7', name: 'Track 2' }],
  };
}

function createTrackIdsFile() {
  return { version: 1, spotifyTrackIds: createDataset().tracks.map((track) => track.id) };
}

function createPreparedDataset(): PreparedPlaylistDataset {
  return { dataset: createDataset(), skippedTracks: [], incompleteTracks: [] };
}
