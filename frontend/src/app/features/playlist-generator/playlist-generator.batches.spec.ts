import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import { PlaylistGeneratorApiService } from './playlist-generator-api.service';
import type { PlaylistTrackIdsFile, PreparedPlaylistDataset } from './playlist-generator.models';

const PREPARATION_URL = '/api/playlist-generator/prepare-dataset';
const GENERATION_URL = '/api/playlist-generator/generate';

describe('PlaylistGenerator sequential preparation batches', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;
  let api: PlaylistGeneratorApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PlaylistGeneratorApiService);
    fixture.detectChanges();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
    }
  });

  it('prepares 20, 20 and 5 IDs sequentially and ranks the whole collection once', async () => {
    const file = createFile(45);
    const generate = vi.spyOn(api, 'generatePlaylist');
    await importFile(file);
    http.expectNone(() => true);
    expect(getProgress()).toBeNull();

    startGeneration();
    const first = expectBatch(file.spotifyTrackIds.slice(0, 20));
    http.expectNone(PREPARATION_URL);
    http.expectNone(GENERATION_URL);
    first.flush(createPreparedDataset(first.request.body.spotifyTrackIds));
    fixture.detectChanges();

    const second = expectBatch(file.spotifyTrackIds.slice(20, 40));
    http.expectNone(PREPARATION_URL);
    http.expectNone(GENERATION_URL);
    second.flush(createPreparedDataset(second.request.body.spotifyTrackIds));
    fixture.detectChanges();

    const third = expectBatch(file.spotifyTrackIds.slice(40));
    http.expectNone(GENERATION_URL);
    third.flush(createPreparedDataset(third.request.body.spotifyTrackIds));
    fixture.detectChanges();

    expect(getText()).toContain('Etap 2/3');
    expect(getText()).not.toContain('Wynik jest gotowy');
    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.dataset.version).toBe(1);
    expect(analysis.request.body.dataset.tracks.map((track: { id: string }) => track.id)).toEqual(
      file.spotifyTrackIds
    );
    expect(generate).toHaveBeenCalledOnce();
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();

    expect(getText()).toContain('Wynik jest gotowy');
    http.expectNone(() => true);
  });

  it('merges skipped tracks and missing measurements across batches', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();
    const firstIds = file.spotifyTrackIds.slice(0, 20);
    const firstData = createPreparedDataset(firstIds.slice(2));
    firstData.skippedTracks = firstIds.slice(0, 2).map((spotifyId) => ({
      spotifyId,
      reason: 'metadata-unavailable',
    }));
    expectBatch(firstIds).flush(firstData);
    fixture.detectChanges();

    const secondIds = file.spotifyTrackIds.slice(20, 40);
    const secondData = createPreparedDataset(secondIds);
    secondData.dataset.tracks[0].audioFeatures.energy = null;
    secondData.incompleteTracks = [{ spotifyId: secondIds[0], missingFeatures: ['energy'] }];
    expectBatch(secondIds).flush(secondData);

    const thirdIds = file.spotifyTrackIds.slice(40);
    const thirdData = createSkippedDataset(thirdIds);
    expectBatch(thirdIds).flush(thirdData);
    fixture.detectChanges();

    expect(getText()).toContain('Pominięte utwory: 7');
    expect(getText()).toContain('Utwory z niepełnymi pomiarami: 1');
    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.dataset.tracks.map((track: { id: string }) => track.id)).toEqual(
      file.spotifyTrackIds.slice(2, 40)
    );
    expect(analysis.request.body.dataset.tracks[18].audioFeatures.energy).toBeNull();
    expect(analysis.request.body.dataset.tracks[0].audioFeatures.instrumentalness).toBe(0);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('continues after an empty batch and does not analyze an entirely empty collection', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();

    for (const ids of [
      file.spotifyTrackIds.slice(0, 20),
      file.spotifyTrackIds.slice(20, 40),
      file.spotifyTrackIds.slice(40),
    ]) {
      expectBatch(ids).flush(createSkippedDataset(ids));
      http.expectNone(GENERATION_URL);
    }
    fixture.detectChanges();

    expect(getText()).toContain('Nie znaleziono utworów z metadanymi i użytecznymi pomiarami');
    expect(getText()).not.toContain('Wynik jest gotowy');
    expect(getButton('#playlist-generate')?.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.generation-error')).toBeNull();
    http.expectNone(() => true);
  });

  it('retains completed batches on 429 and resumes only after another click', async () => {
    const file = createFile(45);
    const read = await importFile(file);
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(0, 20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(0, 20))
    );
    expectBatch(file.spotifyTrackIds.slice(20, 40)).flush(
      { error: { message: 'Private diagnostic' } },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60' } }
    );
    fixture.detectChanges();

    expect(getText()).toContain('Ponów pobieranie za 60 s.');
    expect(getText()).not.toContain('Private diagnostic');
    expect(getText()).toContain('Proces zatrzymany');
    http.expectNone(() => true);

    startGeneration();
    const second = expectBatch(file.spotifyTrackIds.slice(20, 40));
    second.flush(createPreparedDataset(second.request.body.spotifyTrackIds));
    expectBatch(file.spotifyTrackIds.slice(40)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(40))
    );
    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.dataset.tracks.map((track: { id: string }) => track.id)).toEqual(
      file.spotifyTrackIds
    );
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    expect(read).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('retains completed batches on criteria changes but waits for another Generate click', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(0, 20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(0, 20))
    );
    const pending = expectBatch(file.spotifyTrackIds.slice(20, 40));

    setEnergyPreference('low');

    expect(pending.cancelled).toBe(true);
    expect(getProgress()).toBeNull();
    http.expectNone(() => true);
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(20, 40)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(20, 40))
    );
    expectBatch(file.spotifyTrackIds.slice(40)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(40))
    );
    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.preferences.energy).toBe('low');
    expect(analysis.request.body.dataset.tracks).toHaveLength(45);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('clears completed batches when the file is replaced, even with the same IDs', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(0, 20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(0, 20))
    );
    const pending = expectBatch(file.spotifyTrackIds.slice(20, 40));

    await importFile(file, 'replacement.json');

    expect(pending.cancelled).toBe(true);
    expect(getProgress()).toBeNull();
    http.expectNone(() => true);
    startGeneration();
    const first = expectBatch(file.spotifyTrackIds.slice(0, 20));
    expect(getText()).toContain('replacement.json');
    fixture.destroy();
    expect(first.cancelled).toBe(true);
  });

  it('cancels the current batch on destruction without sending the remaining batches', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(0, 20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(0, 20))
    );
    const pending = expectBatch(file.spotifyTrackIds.slice(20, 40));

    fixture.destroy();

    expect(pending.cancelled).toBe(true);
    http.expectNone(() => true);
  });

  it('reuses the complete merged dataset after an analysis error or criteria change', async () => {
    const file = createFile(45);
    await importFile(file);
    startGeneration();
    for (let offset = 0; offset < 45; offset += 20) {
      const ids = file.spotifyTrackIds.slice(offset, offset + 20);
      expectBatch(ids).flush(createPreparedDataset(ids));
    }
    const firstAnalysis = http.expectOne(GENERATION_URL);
    const cachedDataset = firstAnalysis.request.body.dataset;
    firstAnalysis.flush({}, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    startGeneration();
    http.expectNone(PREPARATION_URL);
    const retry = http.expectOne(GENERATION_URL);
    expect(retry.request.body.dataset).toBe(cachedDataset);
    retry.flush({ rankedTracks: [], rejectedTracks: [] });
    setEnergyPreference('high');
    startGeneration();

    http.expectNone(PREPARATION_URL);
    const updated = http.expectOne(GENERATION_URL);
    expect(updated.request.body.dataset).toBe(cachedDataset);
    expect(updated.request.body.preferences.energy).toBe('high');
    updated.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('removes duplicate IDs before batching and shows the unique total', async () => {
    const file = createFile(21);
    await importFile({
      version: 1,
      spotifyTrackIds: [...file.spotifyTrackIds, file.spotifyTrackIds[0], file.spotifyTrackIds[20]],
    });
    startGeneration();
    expectBatch(file.spotifyTrackIds.slice(0, 20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(0, 20))
    );
    expectBatch(file.spotifyTrackIds.slice(20)).flush(
      createPreparedDataset(file.spotifyTrackIds.slice(20))
    );
    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.dataset.tracks.map((track: { id: string }) => track.id)).toEqual(
      file.spotifyTrackIds
    );
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('prepares the maximum 500 IDs in 25 sequential batches without exceeding the total', async () => {
    const file = createFile(500);
    const generate = vi.spyOn(api, 'generatePlaylist');
    await importFile(file);
    startGeneration();

    for (let offset = 0; offset < 500; offset += 20) {
      const ids = file.spotifyTrackIds.slice(offset, offset + 20);
      const batch = expectBatch(ids);
      http.expectNone(PREPARATION_URL);
      http.expectNone(GENERATION_URL);
      batch.flush(createPreparedDataset(ids));
      fixture.detectChanges();
    }

    const analysis = http.expectOne(GENERATION_URL);
    expect(analysis.request.body.dataset.tracks.map((track: { id: string }) => track.id)).toEqual(
      file.spotifyTrackIds
    );
    expect(generate).toHaveBeenCalledOnce();
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    http.expectNone(() => true);
  });

  async function importFile(value: unknown, name = 'ids.json') {
    const file = new File([JSON.stringify(value)], name, { type: 'application/json' });
    const read = vi.fn().mockResolvedValue(JSON.stringify(value));
    Object.defineProperty(file, 'text', { value: read });
    const input = fixture.nativeElement.querySelector('#playlist-dataset-file');
    if (!(input instanceof HTMLInputElement)) throw new Error('Nie znaleziono pola pliku');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    return read;
  }

  function startGeneration(): void {
    const button = getButton('#playlist-generate');
    if (!button) throw new Error('Nie znaleziono przycisku generowania');
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();
  }

  function expectBatch(ids: string[]): TestRequest {
    const request = http.expectOne(PREPARATION_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ version: 1, spotifyTrackIds: ids });
    expect(request.request.withCredentials).toBe(true);
    return request;
  }

  function setEnergyPreference(value: string): void {
    const select = fixture.nativeElement.querySelector('#playlist-preference-energy');
    if (!(select instanceof HTMLSelectElement))
      throw new Error('Nie znaleziono preferencji energii');
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function getButton(selector: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function getProgress(): HTMLElement | null {
    return fixture.nativeElement.querySelector('app-playlist-generation-progress');
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});

function createFile(count: number): PlaylistTrackIdsFile {
  return {
    version: 1,
    spotifyTrackIds: Array.from({ length: count }, (_, index) =>
      String(index + 1).padStart(22, '0')
    ),
  };
}

function createPreparedDataset(ids: string[]): PreparedPlaylistDataset {
  return {
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
  };
}

function createSkippedDataset(ids: string[]): PreparedPlaylistDataset {
  return {
    ...createPreparedDataset([]),
    skippedTracks: ids.map((spotifyId) => ({ spotifyId, reason: 'audio-features-unavailable' })),
  };
}
