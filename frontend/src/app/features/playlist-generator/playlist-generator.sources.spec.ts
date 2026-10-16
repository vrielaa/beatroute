import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import { PlaylistGenerator } from './playlist-generator';
import type { PreparedSpotifyTracksPage } from './playlist-generator.models';

const libraryUrl = '/api/playlist-generator/prepare-saved-tracks';
const fileUrl = '/api/playlist-generator/prepare-dataset';
const analysisUrl = '/api/playlist-generator/generate';
const firstId = 'a'.repeat(22);

describe('PlaylistGenerator data sources', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.useRealTimers();
      TestBed.resetTestingModule();
    }
  });

  it('defaults to file import and switches to library criteria without sending requests', () => {
    expect(button('playlist-source-file').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('#playlist-dataset-file')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();

    switchToLibrary();
    setEnergy('high');

    expect(button('playlist-source-saved-tracks').getAttribute('aria-pressed')).toBe('true');
    expect(button('playlist-source-file').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.querySelector('#playlist-dataset-file')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).not.toBeNull();
    expect(button('playlist-generate').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('app-playlist-generation-progress')).toBeNull();
    http.expectNone(() => true);
  });

  it('starts at offset zero on Generate and keeps unknown totals until the first response', () => {
    switchToLibrary();
    startGeneration();

    const pending = http.expectOne(libraryUrl);
    expect(pending.request.body).toEqual({ offset: 0 });
    expect(pending.request.method).toBe('POST');
    expect(pending.request.withCredentials).toBe(true);
    expect(text()).toContain('Pobieranie zapisanych utworów…');
    expect(text()).not.toContain('Przetworzono');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(button('playlist-generate').disabled).toBe(true);
    http.expectNone(fileUrl);
    http.expectNone(analysisUrl);

    pending.flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('shows completed-page progress and ranks only once after all pages arrive', () => {
    switchToLibrary();
    setEnergy('high');
    const form = fixture.nativeElement.querySelector('app-playlist-criteria-form');
    startGeneration();
    const first = createPage(0, 50, 132);
    const second = createPage(50, 50, 132);
    const third = createPage(100, 32, 132);

    http.expectOne(libraryUrl).flush(first);
    fixture.detectChanges();
    expect(text()).toMatch(/Przetworzono 50 (?:ze|\/) 132/);
    expect(text()).toContain('Pobieranie partii 2 z 3');
    expect(bar().getAttribute('aria-valuenow')).toBe('50');
    expect(bar().getAttribute('aria-valuemax')).toBe('132');
    http.expectNone(analysisUrl);
    const next = http.expectOne(libraryUrl);
    expect(next.request.body).toEqual({ offset: 50 });
    next.flush(second);
    fixture.detectChanges();
    expect(text()).toMatch(/Przetworzono 100 (?:ze|\/) 132/);
    http.expectNone(analysisUrl);
    const last = http.expectOne(libraryUrl);
    expect(last.request.body).toEqual({ offset: 100 });
    last.flush(third);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBe(form);
    expect(text()).toContain('Analiza i ranking');
    expect(text()).toMatch(/Przetworzono 132 (?:ze|\/) 132/);
    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.dataset.tracks).toHaveLength(132);
    expect(analysis.request.body.preferences.energy).toBe('high');
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
    expect(text()).toContain('Wynik jest gotowy');
    http.expectNone(() => true);
  });

  it('reuses the completed dataset when preferences change', () => {
    switchToLibrary();
    startGeneration();
    const page = createPage(0, 1, 1);
    http.expectOne(libraryUrl).flush(page);
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();

    setEnergy('low');
    expect(fixture.nativeElement.querySelector('app-playlist-generator-results')).toBeNull();
    http.expectNone(() => true);
    startGeneration();

    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.dataset).toEqual(page.preparedDataset.dataset);
    expect(analysis.request.body.preferences.energy).toBe('low');
    expect(text()).toContain('Analiza i ranking');
    http.expectNone(libraryUrl);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('shows an empty library separately from a request error and allows a fresh attempt', () => {
    switchToLibrary();
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 0, 0));
    fixture.detectChanges();

    expect(text()).toContain('Nie masz zapisanych utworów w Spotify');
    expect(text()).not.toContain('Wybierz inny plik');
    expect(fixture.nativeElement.querySelector('.generation-error')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(button('playlist-generate').disabled).toBe(false);
    http.expectNone(analysisUrl);

    startGeneration();
    const retry = http.expectOne(libraryUrl);
    expect(retry.request.body).toEqual({ offset: 0 });
    expect(fixture.nativeElement.querySelector('.dataset-empty')).toBeNull();
    retry.flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('distinguishes unavailable library positions from a genuinely empty library', () => {
    switchToLibrary();
    startGeneration();
    const page = createPage(0, 3, 3, []);
    page.unavailableItemsCount = 3;
    http.expectOne(libraryUrl).flush(page);
    fixture.detectChanges();

    expect(text()).toContain('Nie znaleziono utworów z użytecznymi pomiarami');
    expect(text()).toContain('Niedostępne pozycje Spotify: 3');
    expect(text()).not.toContain('Nie masz zapisanych utworów');
    expect(text()).toMatch(/Przetworzono 3 (?:ze|\/) 3/);
    expect(button('playlist-generate').disabled).toBe(false);
    http.expectNone(analysisUrl);
  });

  it.each([
    { status: 400, message: 'Nie udało się przygotować zapisanych utworów' },
    { status: 401, message: 'Połącz ponownie konto Spotify' },
    { status: 403, message: 'zezwól na odczyt zapisanych utworów' },
    { status: 413, message: 'Nie udało się przygotować zapisanych utworów' },
    { status: 429, message: 'Ponów pobieranie za 30 s.' },
    { status: 500, message: 'Nie udało się przygotować zbioru' },
    { status: 502, message: 'Nie udało się pobrać danych ze Spotify lub ReccoBeats' },
    { status: 503, message: 'Nie udało się pobrać danych ze Spotify lub ReccoBeats' },
    { status: 504, message: 'Pobieranie danych trwało zbyt długo' },
  ])(
    'shows a source-appropriate HTTP $status error without automatically retrying',
    ({ status, message }) => {
      switchToLibrary();
      startGeneration();
      http
        .expectOne(libraryUrl)
        .flush(
          { error: { message: 'private diagnostic' } },
          { status, statusText: 'Failure', headers: { 'Retry-After': '30' } }
        );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.generation-error')?.textContent).toContain(
        message
      );
      expect(text()).not.toContain('private diagnostic');
      expect(text()).not.toContain('Sprawdź format pliku');
      expect(text()).toContain('Proces zatrzymany');
      expect(button('playlist-generate').disabled).toBe(false);
      http.expectNone(() => true);
    }
  );

  it.each([429, 502])(
    'stops on HTTP %s on a later library page and retries from zero only on click',
    (status) => {
      switchToLibrary();
      setEnergy('high');
      http.expectNone(() => true);
      vi.useFakeTimers();
      startGeneration();
      http.expectOne(libraryUrl).flush(createPage(0, 50, 132));
      const second = http.expectOne(libraryUrl);
      expect(second.request.body).toEqual({ offset: 50 });
      second.flush(
        {
          error: {
            code: 'RECCOBEATS_API_ERROR',
            details: { integration: 'reccobeats', upstreamStatus: status, retryAfterSeconds: 10 },
          },
        },
        { status, statusText: 'Failure', headers: { 'Retry-After': '10' } }
      );
      fixture.detectChanges();

      expect(text()).toMatch(/Przetworzono 50 (?:ze|\/) 132/);
      expect(fixture.componentInstance['dataset']()).toBeNull();
      expect(fixture.componentInstance['result']()).toBeNull();
      expect(fixture.nativeElement.querySelector('.generation-error')?.textContent).toContain(
        status === 429 ? 'Ponów pobieranie za 10 s.' : 'Nie udało się pobrać danych'
      );
      expect(text()).toContain('Proces zatrzymany');
      expect(text()).not.toContain('Nie masz zapisanych utworów');
      expect(text()).not.toContain('Nie znaleziono utworów');
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      http.expectNone(() => true);
      startGeneration();
      expect(text()).toContain('Pobieranie zapisanych utworów…');
      const retry = http.expectOne(libraryUrl);
      expect(retry.request.body).toEqual({ offset: 0 });
      const replacement = createPage(0, 1, 1, ['z'.repeat(22)]);
      retry.flush(replacement);
      const analysis = http.expectOne(analysisUrl);
      expect(analysis.request.body.dataset).toEqual(replacement.preparedDataset.dataset);
      expect(analysis.request.body.preferences.energy).toBe('high');
      analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    }
  );

  it('cancels pending library preparation and restarts from zero without lost criteria', () => {
    switchToLibrary();
    setEnergy('low');
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 50, 132));
    const pending = http.expectOne(libraryUrl);

    button('playlist-cancel-generation').click();
    fixture.detectChanges();

    expect(pending.cancelled).toBe(true);
    expect(text()).toContain('Pobieranie biblioteki zacznie się od początku');
    expect(fixture.componentInstance['dataset']()).toBeNull();
    http.expectNone(() => true);
    startGeneration();
    const retry = http.expectOne(libraryUrl);
    expect(retry.request.body).toEqual({ offset: 0 });
    retry.flush(createPage(0, 1, 1));
    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.preferences.energy).toBe('low');
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('keeps a completed dataset if analysis is cancelled or fails', () => {
    switchToLibrary();
    startGeneration();
    const page = createPage(0, 1, 1);
    http.expectOne(libraryUrl).flush(page);
    const pending = http.expectOne(analysisUrl);
    button('playlist-cancel-generation').click();
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(text()).toContain('Przygotowany zbiór został zachowany');
    startGeneration();
    http.expectOne(analysisUrl).flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    startGeneration();
    const retry = http.expectOne(analysisUrl);
    expect(retry.request.body.dataset).toEqual(page.preparedDataset.dataset);
    http.expectNone(libraryUrl);
    retry.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('ignores switching sources during generation, including a direct forged call', () => {
    switchToLibrary();
    startGeneration();
    expect(button('playlist-source-file').disabled).toBe(true);
    expect(button('playlist-source-saved-tracks').disabled).toBe(true);

    fixture.componentInstance['changeDataSource']('file');

    expect(fixture.componentInstance['dataSource']()).toBe('saved-tracks');
    http.expectOne(libraryUrl).flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('preserves the imported file when switching back, but clears prepared data, criteria and selection', async () => {
    await importFile();
    const file = fixture.componentInstance['trackIdsFile']();
    startGeneration();
    const fileData = createPage(0, 1, 1, [firstId]).preparedDataset;
    http.expectOne(fileUrl).flush(fileData);
    http.expectOne(analysisUrl).flush({
      rankedTracks: [{ track: fileData.dataset.tracks[0], overallMatch: null, featureMatches: [] }],
      rejectedTracks: [],
    });
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedTrackIds']()).toEqual([firstId]);

    switchToLibrary();
    setEnergy('high');
    expect(fixture.componentInstance['dataset']()).toBeNull();
    expect(fixture.componentInstance['result']()).toBeNull();
    expect(fixture.componentInstance['selectedTrackIds']()).toEqual([]);
    http.expectNone(() => true);
    button('playlist-source-file').click();
    fixture.detectChanges();

    expect(fixture.componentInstance['trackIdsFile']()).toBe(file);
    expect(text()).toContain('test.json');
    expect(
      (fixture.nativeElement.querySelector('#playlist-preference-energy') as HTMLSelectElement)
        .value
    ).toBe('');
    expect(button('playlist-generate').disabled).toBe(false);
    startGeneration();
    http.expectOne(fileUrl).flush(fileData);
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
    http.expectNone(libraryUrl);
  });

  it('clears library cache when switching away and back without fetching until Generate', () => {
    switchToLibrary();
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
    button('playlist-source-file').click();
    fixture.detectChanges();
    expect(button('playlist-generate').disabled).toBe(true);
    switchToLibrary();
    expect(fixture.componentInstance['preparedDataset']()).toBeNull();
    http.expectNone(() => true);
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('does not reset the current form or cached dataset when the active source is clicked again', () => {
    switchToLibrary();
    setEnergy('high');
    const form = fixture.nativeElement.querySelector('app-playlist-criteria-form');
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
    const prepared = fixture.componentInstance['preparedDataset']();

    switchToLibrary();

    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBe(form);
    expect(fixture.componentInstance['preparedDataset']()).toBe(prepared);
    expect(fixture.componentInstance['criteria']()?.preferences.energy).toBe('high');
    http.expectNone(() => true);
  });

  it('blocks library generation while an enabled requirement is incomplete', () => {
    switchToLibrary();
    const enabled = fixture.nativeElement.querySelector('#playlist-tempo-enabled');
    if (!(enabled instanceof HTMLInputElement)) {
      throw new Error('Nie znaleziono ograniczenia BPM');
    }
    enabled.click();
    fixture.detectChanges();

    expect(button('playlist-generate').disabled).toBe(true);
    fixture.componentInstance['generatePlaylist']();
    http.expectNone(() => true);
  });

  it('cancels incomplete preparation on a criteria change and starts a new library snapshot', () => {
    switchToLibrary();
    startGeneration();
    http.expectOne(libraryUrl).flush(createPage(0, 50, 132));
    const pending = http.expectOne(libraryUrl);

    setEnergy('high');

    expect(pending.cancelled).toBe(true);
    expect(button('playlist-generate').disabled).toBe(false);
    expect(fixture.componentInstance['dataset']()).toBeNull();
    http.expectNone(analysisUrl);
    startGeneration();
    const restarted = http.expectOne(libraryUrl);
    expect(restarted.request.body).toEqual({ offset: 0 });
    restarted.flush(createPage(0, 1, 1));
    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.preferences.energy).toBe('high');
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('cancels a pending library request when the page is destroyed', () => {
    switchToLibrary();
    startGeneration();
    const pending = http.expectOne(libraryUrl);

    fixture.destroy();

    expect(pending.cancelled).toBe(true);
    http.expectNone(() => true);
  });

  function switchToLibrary(): void {
    button('playlist-source-saved-tracks').click();
    fixture.detectChanges();
  }

  function startGeneration(): void {
    button('playlist-generate').click();
    fixture.detectChanges();
  }

  function button(id: string): HTMLButtonElement {
    const element = fixture.nativeElement.querySelector(`#${id}`);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Nie znaleziono przycisku ${id}`);
    }
    return element;
  }

  function text(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function bar(): HTMLElement {
    const element = fixture.nativeElement.querySelector('[role="progressbar"]');
    if (!(element instanceof HTMLElement)) {
      throw new Error('Nie znaleziono paska postępu');
    }
    return element;
  }

  function setEnergy(value: string): void {
    const select = fixture.nativeElement.querySelector('#playlist-preference-energy');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Nie znaleziono preferencji energii');
    }
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  async function importFile(): Promise<void> {
    const input = fixture.nativeElement.querySelector('#playlist-dataset-file');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Nie znaleziono pola pliku');
    }
    const file = new File([], 'test.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify({ version: 1, spotifyTrackIds: [firstId] })),
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }
});

function createPage(
  offset: number,
  count: number,
  total: number,
  ids = Array.from({ length: count }, (_, index) => String(offset + index + 1).padStart(22, '0'))
): PreparedSpotifyTracksPage {
  return {
    preparedDataset: {
      dataset: {
        version: 1,
        tracks: ids.map((id) => ({
          id,
          name: `Track ${id}`,
          artists: ['Artist'],
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
        })),
      },
      skippedTracks: [],
      incompleteTracks: [],
    },
    pagination: {
      offset,
      processedItems: count,
      totalItems: total,
      nextOffset: offset + count < Math.min(total, 500) ? offset + count : null,
    },
    unavailableItemsCount: 0,
  };
}
