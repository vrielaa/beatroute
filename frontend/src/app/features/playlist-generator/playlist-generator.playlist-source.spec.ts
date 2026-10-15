import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import type { PreparedPlaylistPage } from './playlist-generator.models';

const playlistId = 'P'.repeat(22);
const sourceUrl = '/api/playlist-generator/prepare-playlist';
const analysisUrl = '/api/playlist-generator/generate';

describe('PlaylistGenerator playlist source', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    button('playlist-source-playlist').click();
    fixture.detectChanges();
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('shows the hint and requires a valid reference without requesting API data', () => {
    expect(text()).toContain('właścicielem lub współtwórcą');
    expect(text()).toContain('https://open.spotify.com/playlist/ID_PLAYLISTY');
    expect(input().disabled).toBe(false);
    expect(button('playlist-generate').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
    setReference('invalid');
    expect(button('playlist-generate').disabled).toBe(true);
    setReference(`https://open.spotify.com/playlist/${playlistId}?si=shared`);
    expect(button('playlist-generate').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-generation-progress')).toBeNull();
    http.expectNone(() => true);
  });

  it('starts on Generate, shows real progress and ranks once after all source pages', () => {
    setReference(playlistId);
    generate();
    const first = http.expectOne(sourceUrl);
    expect(first.request.body).toEqual({ playlistId, offset: 0, snapshotId: null });
    expect(text()).toContain('Pobieranie playlisty…');
    expect(input().disabled).toBe(true);
    expect(button('playlist-source-file').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    first.flush(page(0, 50, 52));
    fixture.detectChanges();
    expect(text()).toContain('Playlista: Summer');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemax')).toBe('52');
    http.expectNone(analysisUrl);
    const second = http.expectOne(sourceUrl);
    expect(second.request.body).toEqual({ playlistId, offset: 50, snapshotId: 'version-1' });
    second.flush(page(50, 2, 52));
    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.dataset.tracks).toHaveLength(52);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
    expect(text()).toContain('Wynik jest gotowy');
    expect(input().disabled).toBe(false);
    http.expectNone(() => true);
  });

  it('reuses data and criteria for the same ID, including a different sharing URL', () => {
    setReference(playlistId);
    completeGeneration();
    const criteriaForm = fixture.nativeElement.querySelector('app-playlist-criteria-form');
    setReference(`https://open.spotify.com/playlist/${playlistId}?si=another`);
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBe(criteriaForm);
    const energy = fixture.nativeElement.querySelector(
      '#playlist-preference-energy'
    ) as HTMLSelectElement;
    energy.value = 'low';
    energy.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    generate();
    const analysis = http.expectOne(analysisUrl);
    expect(analysis.request.body.preferences.energy).toBe('low');
    expect(analysis.request.body.dataset.tracks).toHaveLength(1);
    http.expectNone(sourceUrl);
    analysis.flush({ rankedTracks: [], rejectedTracks: [] });
  });

  it('invalidates previous data, results and selection when the ID changes', () => {
    setReference(playlistId);
    completeGeneration();
    setReference('invalid');
    expect(fixture.componentInstance['dataset']()).toBeNull();
    expect(fixture.componentInstance['result']()).toBeNull();
    expect(fixture.componentInstance['selectedTrackIds']()).toEqual([]);
    expect(button('playlist-generate').disabled).toBe(true);
    const other = 'Q'.repeat(22);
    setReference(other);
    generate();
    const request = http.expectOne(sourceUrl);
    expect(request.request.body).toEqual({ playlistId: other, offset: 0, snapshotId: null });
    const otherPage = page(0, 0, 0);
    otherPage.playlist.id = other;
    request.flush(otherPage);
  });

  it('preserves the reference when switching sources but prepares a fresh dataset', () => {
    setReference(playlistId);
    completeGeneration();
    button('playlist-source-saved-tracks').click();
    fixture.detectChanges();
    button('playlist-source-playlist').click();
    fixture.detectChanges();
    expect(input().value).toBe(playlistId);
    expect(fixture.componentInstance['dataset']()).toBeNull();
    http.expectNone(() => true);
    generate();
    http.expectOne(sourceUrl).flush(page(0, 0, 0));
  });

  it.each([true, false])(
    'distinguishes an empty source from unavailable measurements: %s',
    (empty) => {
      setReference(playlistId);
      generate();
      const response = page(0, empty ? 0 : 3, empty ? 0 : 3);
      response.preparedDataset.dataset.tracks = [];
      response.unavailableItemsCount = empty ? 0 : 3;
      http.expectOne(sourceUrl).flush(response);
      fixture.detectChanges();
      expect(text()).toContain(
        empty ? 'Playlista jest pusta' : 'Nie znaleziono utworów z użytecznymi pomiarami'
      );
      expect(fixture.nativeElement.querySelector('.generation-error')).toBeNull();
      expect(button('playlist-generate').disabled).toBe(false);
      http.expectNone(analysisUrl);
    }
  );

  it.each([
    { status: 401, message: 'Połącz ponownie konto Spotify' },
    { status: 403, message: 'Brak dostępu do playlisty' },
    { status: 404, message: 'Nie znaleziono playlisty' },
    { status: 409, message: 'Playlista zmieniła się' },
    { status: 429, message: 'Ponów pobieranie za 60 s' },
    { status: 502, message: 'Nie udało się pobrać danych ze Spotify lub ReccoBeats' },
  ])(
    'explains HTTP $status without presenting an empty source or leaking details',
    ({ status, message }) => {
      setReference(playlistId);
      generate();
      http
        .expectOne(sourceUrl)
        .flush(
          { error: { message: 'SECRET provider diagnostic' } },
          { status, statusText: 'Failure', headers: { 'Retry-After': '60' } }
        );
      fixture.detectChanges();
      expect(text()).toContain(message);
      expect(text()).not.toContain('SECRET');
      expect(text()).not.toContain('Playlista jest pusta');
      http.expectNone(analysisUrl);
      generate();
      const retry = http.expectOne(sourceUrl);
      expect(retry.request.body).toEqual({ playlistId, offset: 0, snapshotId: null });
      retry.flush(page(0, 0, 0));
    }
  );

  it('explains a missing read scope separately from playlist access', () => {
    setReference(playlistId);
    generate();
    http
      .expectOne(sourceUrl)
      .flush(
        { error: { code: 'SPOTIFY_PLAYLIST_PERMISSION_REQUIRED' } },
        { status: 403, statusText: 'Denied' }
      );
    fixture.detectChanges();
    expect(text()).toContain('zezwól na odczyt playlist');
  });

  it('cancels a pending page and restarts from zero on another click', () => {
    setReference(playlistId);
    generate();
    http.expectOne(sourceUrl).flush(page(0, 1, 3));
    const pending = http.expectOne(sourceUrl);
    button('playlist-cancel-generation').click();
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.componentInstance['dataset']()).toBeNull();
    generate();
    const restarted = http.expectOne(sourceUrl);
    expect(restarted.request.body).toEqual({ playlistId, offset: 0, snapshotId: null });
    restarted.flush(page(0, 0, 0));
    http.expectNone(analysisUrl);
  });

  function completeGeneration() {
    generate();
    http.expectOne(sourceUrl).flush(page(0, 1, 1));
    http.expectOne(analysisUrl).flush({ rankedTracks: [], rejectedTracks: [] });
    fixture.detectChanges();
  }
  function input(): HTMLInputElement {
    const element = fixture.nativeElement.querySelector('#playlist-source-reference');
    if (!(element instanceof HTMLInputElement))
      throw new Error('Nie znaleziono pola źródłowej playlisty');
    return element;
  }
  function setReference(reference: string) {
    input().value = reference;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }
  function generate() {
    button('playlist-generate').click();
    fixture.detectChanges();
  }
  function button(id: string): HTMLButtonElement {
    const element = fixture.nativeElement.querySelector(`#${id}`);
    if (!(element instanceof HTMLButtonElement)) throw new Error(`Nie znaleziono przycisku ${id}`);
    return element;
  }
  function text(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }
});

function page(offset: number, count: number, total: number): PreparedPlaylistPage {
  return {
    playlist: { id: playlistId, name: 'Summer', snapshotId: 'version-1' },
    preparedDataset: {
      dataset: {
        version: 1,
        tracks: Array.from({ length: count }, (_, index) => ({
          id: String(offset + index).padStart(22, '0'),
          name: 'Song',
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
