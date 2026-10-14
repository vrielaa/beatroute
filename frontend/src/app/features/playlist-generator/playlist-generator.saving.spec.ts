import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rateLimitRetryInterceptor } from '@core/interceptors/rate-limit-retry.interceptor';
import { PlaylistGenerator } from './playlist-generator';
import { PlaylistSaveForm } from './playlist-save-form/playlist-save-form';
import type { GeneratedPlaylist, PlaylistDataset } from './playlist-generator.models';

const saveUrl = '/api/playlist-generator/save';
const firstId = 'a'.repeat(22);
const rejectedId = 'b'.repeat(22);
const bestId = 'c'.repeat(22);

describe('PlaylistGenerator saving', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;
  let dataset: PlaylistDataset;

  beforeEach(async () => {
    dataset = createDataset();
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
      TestBed.resetTestingModule();
    }
  });

  it('does not show a save form or send a save request before generation', async () => {
    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
    await importFile();
    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
    http.expectNone(() => true);
  });

  it('shows the save form after a nonempty ranking, without starting a save', async () => {
    await showResult();

    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).not.toBeNull();
    expect(getButton('playlist-save').disabled).toBe(true);
    expect(getText()).toContain('Wybrano utworów: 2.');
    http.expectNone(() => true);
  });

  it('does not offer saving when every track was rejected', async () => {
    await showResult({
      rankedTracks: [],
      rejectedTracks: dataset.tracks.map((track) => ({
        track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      })),
    });

    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
    fixture.componentInstance['savePlaylist']('Playlist');
    http.expectNone(saveUrl);
  });

  it('sends only the name and Top N selection without fetching or ranking again', async () => {
    await showResult();
    setTrackCount('1');
    setName('  Na trening  ');

    getButton('playlist-save').click();
    fixture.detectChanges();

    const request = http.expectOne(saveUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ name: 'Na trening', trackIds: [bestId] });
    http.expectNone('/api/playlist-generator/prepare-dataset');
    http.expectNone('/api/playlist-generator/generate');
    request.flush(createSavedPlaylist(1), { status: 201, statusText: 'Created' });
  });

  it('saves manual choices in ranking order, not click order, excluding rejected tracks', async () => {
    await showResult();
    setTrackCount('');
    selectMode('Ręcznie');
    toggleTrack(firstId);
    toggleTrack(bestId);
    setName('Ręczny wybór');

    getButton('playlist-save').click();

    const request = http.expectOne(saveUrl);
    expect(request.request.body).toEqual({ name: 'Ręczny wybór', trackIds: [bestId, firstId] });
    expect(request.request.body.trackIds).not.toContain(rejectedId);
    request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
  });

  it('keeps the entered name as selection changes but blocks saving an empty choice', async () => {
    await showResult();
    setName('Na trening');
    setTrackCount('0');

    expect(getInput('playlist-save-name').value).toBe('Na trening');
    expect(getButton('playlist-save').disabled).toBe(true);
    getSaveForm().saveRequested.emit('Na trening');
    http.expectNone(saveUrl);

    setTrackCount('1');
    expect(getButton('playlist-save').disabled).toBe(false);
    http.expectNone(() => true);
  });

  it.each(['', '   ', 'x'.repeat(101)])('blocks a forged invalid name: %j', async (name) => {
    await showResult();
    getSaveForm().saveRequested.emit(name);
    http.expectNone(saveUrl);
  });

  it('locks data, criteria and selection and ignores duplicate submissions during a save', async () => {
    await showResult();
    const result = fixture.componentInstance['result']();
    const originalCriteria = fixture.componentInstance['criteria']();
    setName('Na trening');
    const form = getSaveForm();
    form.saveRequested.emit('Na trening');
    form.saveRequested.emit('Drugi zapis');
    fixture.detectChanges();
    const request = http.expectOne(saveUrl);

    expect(getButton('playlist-save').disabled).toBe(true);
    expect(getInput('playlist-save-name').disabled).toBe(true);
    expect(getButton('playlist-generate').disabled).toBe(true);
    expect(getButton('playlist-choose-file').disabled).toBe(true);
    expect(getInput('playlist-dataset-file').disabled).toBe(true);
    expect(getInput('playlist-top-track-count').matches(':disabled')).toBe(true);
    const select = fixture.nativeElement.querySelector('#playlist-preference-energy');
    expect(select.matches(':disabled')).toBe(true);
    expect(fixture.nativeElement.querySelector('.playlist-save').getAttribute('aria-busy')).toBe(
      'true'
    );
    expect(getText()).toContain('Nie zamykaj tego widoku');

    fixture.componentInstance['updateCriteria'](null);
    fixture.componentInstance['updateSelectedTrackIds']([]);
    fixture.componentInstance['generatePlaylist']();
    fixture.componentInstance['startNewSave']();
    await importFile('replacement.json');

    expect(request.cancelled).toBe(false);
    expect(fixture.componentInstance['result']()).toBe(result);
    expect(fixture.componentInstance['criteria']()).toBe(originalCriteria);
    expect(fixture.componentInstance['selectedTrackIds']()).toEqual([bestId, firstId]);
    expect(getText()).toContain('playlist.json');
    http.expectNone(() => true);
    request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(getButton('playlist-generate').disabled).toBe(false);
    expect(getButton('playlist-choose-file').disabled).toBe(false);
    expect(getInput('playlist-top-track-count').matches(':disabled')).toBe(false);
  });

  it('shows a complete save and its Spotify link without changing the ranking', async () => {
    const result = createResult(dataset);
    const original = structuredClone(result);
    await showResult(result);
    startSave();
    http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(getText()).toContain('Playlista zapisana');
    expect(getText()).toContain('potwierdzono dodanie 2 utworów');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.save-success a');
    expect(link.href).toBe('https://open.spotify.com/playlist/new-playlist-id');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.save-error')).toBeNull();
    expect(fixture.componentInstance['result']()).toEqual(original);
    expect(fixture.nativeElement.querySelectorAll('app-playlist-ranked-track')).toHaveLength(2);
    fixture.componentInstance['savePlaylist']('Another playlist');
    http.expectNone(saveUrl);
  });

  it('requires a new explicit action before creating another playlist after success', async () => {
    await showResult();
    startSave();
    http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    getNewSaveButton().click();
    fixture.detectChanges();

    expect(getInput('playlist-save-name').value).toBe('');
    expect(getButton('playlist-save').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.save-success')).toBeNull();
    http.expectNone(saveUrl);
    startSave('Druga playlista');
    const request = http.expectOne(saveUrl);
    expect(request.request.body.name).toBe('Druga playlista');
    request.flush(
      { ...createSavedPlaylist(), name: 'Druga playlista' },
      { status: 201, statusText: 'Created' }
    );
  });

  it.each([
    { status: 400, text: 'Sprawdź jej nazwę i wybór utworów' },
    { status: 401, text: 'Połącz ponownie konto Spotify' },
    { status: 403, text: 'zezwól na zapisywanie prywatnych playlist' },
    { status: 413, text: 'maksymalnie 500' },
    { status: 429, text: 'Odczekaj 30 s.' },
    { status: 500, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 502, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 503, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 504, text: 'Sprawdź swoje playlisty w Spotify' },
  ])(
    'shows a safe HTTP $status error and preserves the selection and name',
    async ({ status, text }) => {
      await showResult();
      startSave();
      http
        .expectOne(saveUrl)
        .flush(
          { error: { message: 'secret-provider-message', details: 'secret-token' } },
          { status, statusText: 'Failed', headers: { 'Retry-After': '30' } }
        );
      fixture.detectChanges();

      expect(getText()).toContain(text);
      expect(getText()).not.toContain('secret-');
      expect(getInput('playlist-save-name').value).toBe('Na trening');
      expect(getButton('playlist-save').disabled).toBe(false);
      expect(fixture.componentInstance['selectedTrackIds']()).toEqual([bestId, firstId]);
      expect(fixture.nativeElement.querySelector('.save-success')).toBeNull();
      http.expectNone(() => true);
    }
  );

  it('warns about an unknown write result after a connection failure without retrying', async () => {
    await showResult();
    startSave();
    http.expectOne(saveUrl).error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(getText()).toContain('Nie otrzymano potwierdzenia zapisu');
    expect(getText()).toContain('Sprawdź swoje playlisty w Spotify');
    expect(fixture.nativeElement.querySelector('.save-success')).toBeNull();
    http.expectNone(saveUrl);
  });

  it.each([401, 429, 504])(
    'shows the existing playlist with zero confirmations after a partial HTTP %i error',
    async (status) => {
      await showResult();
      startSave();
      http.expectOne(saveUrl).flush(createPartialResponse(), {
        status,
        statusText: 'Incomplete',
        headers: { 'Retry-After': '30' },
      });
      fixture.detectChanges();

      expect(getText()).toContain('potwierdzono 0 z 2');
      expect(getText()).toContain('Niepotwierdzona partia mogła również zostać zapisana');
      expect(getText()).not.toContain('secret-');
      expect(getText()).not.toContain('Playlista zapisana');
      expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
      const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.save-partial a');
      expect(link.href).toBe('https://open.spotify.com/playlist/new-playlist-id');
      fixture.componentInstance['savePlaylist']('Another playlist');
      http.expectNone(saveUrl);
    }
  );

  it('does not resume an incomplete playlist when the user starts another save', async () => {
    await showResult();
    startSave();
    http
      .expectOne(saveUrl)
      .flush(createPartialResponse(), { status: 429, statusText: 'Incomplete' });
    fixture.detectChanges();

    expect(getNewSaveButton().textContent).toContain('Sprawdzono playlistę');
    getNewSaveButton().click();
    fixture.detectChanges();
    http.expectNone(saveUrl);
    startSave('Nowa playlista');
    const request = http.expectOne(saveUrl);
    expect(request.request.body).toEqual({ name: 'Nowa playlista', trackIds: [bestId, firstId] });
    expect(request.request.body.playlistId).toBeUndefined();
    request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
  });

  it('shows 100 confirmed tracks after a later batch fails in a 201-track selection', async () => {
    const template = dataset.tracks[0];
    dataset = {
      version: 1,
      tracks: Array.from({ length: 201 }, (_, index) => ({
        ...template,
        id: index.toString(36).padStart(22, '0'),
      })),
    };
    await showResult({
      rankedTracks: dataset.tracks.map((track) => ({
        track,
        overallMatch: null,
        featureMatches: [],
      })),
      rejectedTracks: [],
    });
    startSave();
    const request = http.expectOne(saveUrl);
    expect(request.request.body.trackIds).toEqual(dataset.tracks.map((track) => track.id));
    const response = createPartialResponse();
    response.error.details.progress.confirmedTrackCount = 100;
    response.error.details.progress.requestedTrackCount = 201;
    request.flush(response, { status: 429, statusText: 'Incomplete' });
    fixture.detectChanges();

    expect(getText()).toContain('potwierdzono 100 z 201');
    expect(getText()).not.toContain('Playlista zapisana');
    http.expectNone(saveUrl);
  });

  it('ignores partial progress from a different selection while retaining the warning', async () => {
    await showResult();
    startSave();
    const response = createPartialResponse();
    response.error.details.progress.requestedTrackCount = 250;
    http.expectOne(saveUrl).flush(response, { status: 429, statusText: 'Incomplete' });
    fixture.detectChanges();

    expect(getText()).toContain('Nie potwierdzono zapisu wszystkich utworów');
    expect(fixture.nativeElement.querySelector('.save-partial')).toBeNull();
    http.expectNone(saveUrl);
  });

  it('does not show success or unsafe links when a 201 response is malformed', async () => {
    await showResult();
    startSave();
    http
      .expectOne(saveUrl)
      .flush(
        { ...createSavedPlaylist(), spotifyUrl: 'https://example.com/playlist/new-playlist-id' },
        { status: 201, statusText: 'Created' }
      );
    fixture.detectChanges();

    expect(getText()).toContain('Nie otrzymano potwierdzenia zapisu');
    expect(fixture.nativeElement.querySelector('.save-success')).toBeNull();
    expect(fixture.nativeElement.querySelector('.playlist-save a')).toBeNull();
    http.expectNone(saveUrl);
  });

  it('clears the old save outcome when generating a new result', async () => {
    await showResult();
    startSave();
    http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    getButton('playlist-generate').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.save-success')).toBeNull();
    http.expectNone('/api/playlist-generator/prepare-dataset');
    http.expectOne('/api/playlist-generator/generate').flush(createResult(dataset));
    fixture.detectChanges();
    expect(getInput('playlist-save-name').value).toBe('');
    http.expectNone(saveUrl);
  });

  it('clears the save outcome on criteria change and file replacement without another save', async () => {
    await showResult();
    startSave();
    http
      .expectOne(saveUrl)
      .flush(createPartialResponse(), { status: 429, statusText: 'Incomplete' });
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      '#playlist-preference-energy'
    );
    select.value = 'high';
    select.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.save-partial')).toBeNull();
    expect(fixture.componentInstance['partialSaveProgress']()).toBeNull();
    await importFile('replacement.json');
    expect(fixture.nativeElement.querySelector('app-playlist-save-form')).toBeNull();
    http.expectNone(() => true);
  });

  it('ends local waiting when the view is destroyed without issuing another save', async () => {
    await showResult();
    startSave();
    const request = http.expectOne(saveUrl);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.expectNone(saveUrl);
  });

  async function importFile(name = 'playlist.json'): Promise<void> {
    const file = new File([], name, { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: () =>
        Promise.resolve(
          JSON.stringify({ version: 1, spotifyTrackIds: dataset.tracks.map((track) => track.id) })
        ),
    });
    const input = getInput('playlist-dataset-file');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function showResult(result = createResult(dataset)): Promise<void> {
    await importFile();
    getButton('playlist-generate').click();
    for (let offset = 0; offset < dataset.tracks.length; offset += 20) {
      const tracks = dataset.tracks.slice(offset, offset + 20);
      const preparation = http.expectOne('/api/playlist-generator/prepare-dataset');
      expect(preparation.request.body.spotifyTrackIds).toEqual(tracks.map((track) => track.id));
      preparation.flush({
        dataset: { version: 1, tracks },
        skippedTracks: [],
        incompleteTracks: [],
      });
    }
    http.expectOne('/api/playlist-generator/generate').flush(result);
    fixture.detectChanges();
  }

  function startSave(name = 'Na trening'): void {
    setName(name);
    getButton('playlist-save').click();
    fixture.detectChanges();
  }

  function setName(name: string): void {
    const input = getInput('playlist-save-name');
    input.value = name;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function setTrackCount(value: string): void {
    const input = getInput('playlist-top-track-count');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function selectMode(label: string): void {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.selection-modes button')
    );
    const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (!button) throw new Error(`Nie znaleziono trybu ${label}`);
    button.click();
    fixture.detectChanges();
  }

  function toggleTrack(id: string): void {
    const inputs: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.track-selection-toggle input')
    );
    const input = inputs.find((candidate) => candidate.value === id);
    if (!input) throw new Error(`Nie znaleziono utworu ${id}`);
    input.click();
    fixture.detectChanges();
  }

  function getInput(id: string): HTMLInputElement {
    const element = fixture.nativeElement.querySelector(`#${id}`);
    if (!(element instanceof HTMLInputElement)) throw new Error(`Nie znaleziono pola ${id}`);
    return element;
  }

  function getButton(id: string): HTMLButtonElement {
    const element = fixture.nativeElement.querySelector(`#${id}`);
    if (!(element instanceof HTMLButtonElement)) throw new Error(`Nie znaleziono przycisku ${id}`);
    return element;
  }

  function getNewSaveButton(): HTMLButtonElement {
    const element = fixture.nativeElement.querySelector('.save-new');
    if (!(element instanceof HTMLButtonElement))
      throw new Error('Nie znaleziono przycisku nowego zapisu');
    return element;
  }

  function getSaveForm(): PlaylistSaveForm {
    const element = fixture.debugElement.query(By.directive(PlaylistSaveForm));
    if (!element) throw new Error('Nie znaleziono formularza zapisu');
    return element.injector.get(PlaylistSaveForm);
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});

function createDataset(): PlaylistDataset {
  return {
    version: 1,
    tracks: [firstId, rejectedId, bestId].map((id) => ({
      id,
      name: `Utwór ${id}`,
      artists: ['Artysta'],
      audioFeatures: {
        tempo: 128,
        energy: 0.8,
        danceability: 0.7,
        valence: 0.6,
        acousticness: 0.1,
        instrumentalness: 0.2,
        speechiness: 0.1,
        liveness: 0.1,
      },
    })),
  };
}

function createResult(dataset: PlaylistDataset): GeneratedPlaylist {
  return {
    rankedTracks: [dataset.tracks[2], dataset.tracks[0]].map((track) => ({
      track,
      overallMatch: 1,
      featureMatches: [],
    })),
    rejectedTracks: [
      { track: dataset.tracks[1], reasons: [{ feature: 'tempo', code: 'outside-range' }] },
    ],
  };
}

function createSavedPlaylist(trackCount = 2) {
  return {
    id: 'new-playlist-id',
    name: 'Na trening',
    spotifyUrl: 'https://open.spotify.com/playlist/new-playlist-id',
    trackCount,
  };
}

function createPartialResponse() {
  return {
    error: {
      code: 'PLAYLIST_SAVE_INCOMPLETE',
      message: 'secret-provider-message',
      details: {
        progress: {
          id: 'new-playlist-id',
          name: 'Na trening',
          spotifyUrl: 'https://open.spotify.com/playlist/new-playlist-id',
          confirmedTrackCount: 0,
          requestedTrackCount: 2,
        },
        accessToken: 'secret-token',
      },
    },
  };
}
