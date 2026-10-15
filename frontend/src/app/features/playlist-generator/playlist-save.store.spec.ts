import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlaylistSaveStore } from './playlist-save.store';
import type {
  PlaylistSaveProgress,
  PlaylistToSave,
  SavedPlaylist,
} from './playlist-generator.models';

const saveUrl = '/api/playlist-generator/save';
const resumeUrl = '/api/playlist-generator/resume-save';

describe('PlaylistSaveStore', () => {
  let store: PlaylistSaveStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlaylistSaveStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PlaylistSaveStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('starts without save state or HTTP requests', () => {
    expect(store.isSaving()).toBe(false);
    expect(store.savedPlaylist()).toBeNull();
    expect(store.partialSaveProgress()).toBeNull();
    expect(store.saveError()).toBeNull();
    expect(store.isResumptionBlocked()).toBe(false);
    http.expectNone(() => true);
  });

  it('trims the name and stores a complete confirmation', () => {
    store.savePlaylist({ ...createSelection(), name: '  Na trening  ' });

    const request = http.expectOne(saveUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(createSelection());
    expect(store.isSaving()).toBe(true);
    expect(store.savedPlaylist()).toBeNull();

    request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });

    expect(store.isSaving()).toBe(false);
    expect(store.savedPlaylist()).toEqual(createSavedPlaylist());
    expect(store.partialSaveProgress()).toBeNull();
    expect(store.saveError()).toBeNull();
    http.expectNone(() => true);
  });

  it('uses the original selection when the caller changes its data during the request', () => {
    const selection = createSelection();
    store.savePlaylist(selection);
    selection.trackIds.push('c'.repeat(22));
    selection.name = 'Zmieniony wybór';

    const request = http.expectOne(saveUrl);
    expect(request.request.body).toEqual(createSelection());
    request.flush(partialSaveError(createProgress()), { status: 502, statusText: 'Incomplete' });

    expect(store.partialSaveProgress()).toEqual(createProgress());
    expect(store.isSaving()).toBe(false);
  });

  it.each(['', '   ', 'x'.repeat(101)])('ignores an invalid name %j', (name) => {
    store.savePlaylist({ ...createSelection(), name });

    expect(store.isSaving()).toBe(false);
    http.expectNone(() => true);
  });

  it.each([0, 501])('ignores a selection of %s tracks', (count) => {
    store.savePlaylist({
      ...createSelection(),
      trackIds: Array.from({ length: count }, (_, index) => String(index).padStart(22, '0')),
    });

    expect(store.isSaving()).toBe(false);
    http.expectNone(() => true);
  });

  it('accepts the upper limit of 500 tracks', () => {
    const trackIds = Array.from({ length: 500 }, (_, index) => String(index).padStart(22, '0'));
    store.savePlaylist({ ...createSelection(), trackIds });

    const request = http.expectOne(saveUrl);
    expect(request.request.body.trackIds).toHaveLength(500);
    request.flush(
      { ...createSavedPlaylist(), trackCount: 500 },
      { status: 201, statusText: 'Created' }
    );

    expect(store.savedPlaylist()?.trackCount).toBe(500);
    expect(store.isSaving()).toBe(false);
  });

  it('does not repeat or clear an active save and requires a new action after success', () => {
    store.savePlaylist(createSelection());
    const request = http.expectOne(saveUrl);

    store.savePlaylist(createSelection());
    store.resumePlaylist();
    store.clearCompletedSave();
    store.startNewSave();

    expect(store.isSaving()).toBe(true);
    expect(request.cancelled).toBe(false);
    http.expectNone(() => true);
    request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });

    store.savePlaylist(createSelection());
    http.expectNone(saveUrl);
    store.startNewSave();
    expect(store.savedPlaylist()).toBeNull();
    http.expectNone(() => true);

    store.savePlaylist(createSelection());
    http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
  });

  it('stores an error without automatically retrying and clears it before a manual retry', () => {
    store.savePlaylist(createSelection());
    http.expectOne(saveUrl).flush({}, { status: 503, statusText: 'Unavailable' });

    expect(store.isSaving()).toBe(false);
    expect(store.savedPlaylist()).toBeNull();
    expect(store.partialSaveProgress()).toBeNull();
    expect(store.saveError()).toBeTruthy();
    http.expectNone(() => true);

    store.savePlaylist(createSelection());
    expect(store.saveError()).toBeNull();
    expect(store.isSaving()).toBe(true);
    http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
  });

  it.each(['success', 'error'] as const)(
    'clears a completed %s without sending HTTP requests',
    (outcome) => {
      store.savePlaylist(createSelection());
      const request = http.expectOne(saveUrl);
      if (outcome === 'success') {
        request.flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
      } else {
        request.flush({}, { status: 500, statusText: 'Error' });
      }

      store.clearCompletedSave();

      expect(store.savedPlaylist()).toBeNull();
      expect(store.saveError()).toBeNull();
      expect(store.isSaving()).toBe(false);
      http.expectNone(() => true);
    }
  );

  it('preserves partial progress when the page clears completed results and blocks a new save', () => {
    failWithPartialSave();
    const error = store.saveError();

    store.clearCompletedSave();
    store.savePlaylist(createSelection());

    expect(store.partialSaveProgress()).toEqual(createProgress());
    expect(store.saveError()).toBe(error);
    expect(store.savedPlaylist()).toBeNull();
    expect(store.isSaving()).toBe(false);
    http.expectNone(() => true);
  });

  it('discards partial progress describing a different selection size', () => {
    failWithPartialSave(createProgress({ requestedTrackCount: 3 }));

    expect(store.partialSaveProgress()).toBeNull();
    expect(store.saveError()).toBeTruthy();
    store.resumePlaylist();
    http.expectNone(resumeUrl);
  });

  it('does not resume without a pending save', () => {
    store.resumePlaylist();

    expect(store.isSaving()).toBe(false);
    http.expectNone(() => true);
  });

  it('resumes the same playlist once and replaces progress with a complete confirmation', () => {
    failWithPartialSave();
    store.resumePlaylist();

    const request = http.expectOne(resumeUrl);
    expect(request.request.body).toEqual({ playlistId: 'playlist-1' });
    expect(store.isSaving()).toBe(true);
    expect(store.saveError()).toBeNull();
    store.resumePlaylist();
    store.savePlaylist(createSelection());
    store.clearCompletedSave();
    store.startNewSave();
    expect(store.partialSaveProgress()).toEqual(createProgress());
    expect(request.cancelled).toBe(false);
    http.expectNone(() => true);

    request.flush(createSavedPlaylist());

    expect(store.savedPlaylist()).toEqual(createSavedPlaylist());
    expect(store.partialSaveProgress()).toBeNull();
    expect(store.saveError()).toBeNull();
    expect(store.isResumptionBlocked()).toBe(false);
    expect(store.isSaving()).toBe(false);
  });

  it('preserves progress after a transient resume failure and allows a manual retry', () => {
    failWithPartialSave();
    store.resumePlaylist();
    http
      .expectOne(resumeUrl)
      .flush({}, { status: 429, statusText: 'Limited', headers: { 'Retry-After': '30' } });

    expect(store.partialSaveProgress()).toEqual(createProgress());
    expect(store.isResumptionBlocked()).toBe(false);
    expect(store.saveError()).toContain('30 s');
    expect(store.isSaving()).toBe(false);
    http.expectNone(() => true);

    store.resumePlaylist();
    expect(store.saveError()).toBeNull();
    http.expectOne(resumeUrl).flush(createSavedPlaylist());
  });

  it('updates partial progress only for the same playlist and original track count', () => {
    failWithPartialSave();
    const progress = createProgress({ confirmedTrackCount: 1 });
    store.resumePlaylist();
    http
      .expectOne(resumeUrl)
      .flush(partialSaveError(progress), { status: 502, statusText: 'Incomplete' });

    expect(store.partialSaveProgress()).toEqual(progress);
    expect(store.savedPlaylist()).toBeNull();
    expect(store.isSaving()).toBe(false);
  });

  it.each([
    { id: 'another-playlist', spotifyUrl: 'https://open.spotify.com/playlist/another-playlist' },
    { requestedTrackCount: 3 },
  ])('ignores a mismatched partial update %j', (changes) => {
    failWithPartialSave();
    store.resumePlaylist();
    http
      .expectOne(resumeUrl)
      .flush(partialSaveError(createProgress(changes)), { status: 502, statusText: 'Incomplete' });

    expect(store.partialSaveProgress()).toEqual(createProgress());
    expect(store.saveError()).toBeTruthy();
    expect(store.isSaving()).toBe(false);
  });

  it.each(['PLAYLIST_CONTENTS_CHANGED', 'PLAYLIST_RESUME_UNAVAILABLE'])(
    'blocks resumption after %s until an explicit new save',
    (code) => {
      failWithPartialSave();
      store.resumePlaylist();
      http.expectOne(resumeUrl).flush({ error: { code } }, { status: 409, statusText: 'Conflict' });
      const error = store.saveError();

      store.clearCompletedSave();
      store.resumePlaylist();
      store.savePlaylist(createSelection());

      expect(store.partialSaveProgress()).toEqual(createProgress());
      expect(store.isResumptionBlocked()).toBe(true);
      expect(store.saveError()).toBe(error);
      http.expectNone(() => true);

      store.startNewSave();

      expect(store.partialSaveProgress()).toBeNull();
      expect(store.isResumptionBlocked()).toBe(false);
      expect(store.saveError()).toBeNull();
      http.expectNone(() => true);
      store.savePlaylist(createSelection());
      http.expectOne(saveUrl).flush(createSavedPlaylist(), { status: 201, statusText: 'Created' });
    }
  );

  it.each(['save', 'resume'] as const)(
    'ends local waiting when destroyed during %s',
    (operation) => {
      if (operation === 'resume') {
        failWithPartialSave();
        store.resumePlaylist();
      } else {
        store.savePlaylist(createSelection());
      }
      const request = http.expectOne(operation === 'save' ? saveUrl : resumeUrl);

      TestBed.resetTestingModule();

      expect(request.cancelled).toBe(true);
      expect(store.isSaving()).toBe(false);
      expect(store.savedPlaylist()).toBeNull();
      http.expectNone(() => true);
    }
  );

  function failWithPartialSave(progress = createProgress()): void {
    store.savePlaylist(createSelection());
    http
      .expectOne(saveUrl)
      .flush(partialSaveError(progress), { status: 502, statusText: 'Incomplete' });
  }
});

function createSelection(): PlaylistToSave {
  return { name: 'Na trening', trackIds: ['a'.repeat(22), 'b'.repeat(22)] };
}

function createSavedPlaylist(): SavedPlaylist {
  return {
    id: 'playlist-1',
    name: 'Na trening',
    spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
    trackCount: 2,
  };
}

function createProgress(overrides: Partial<PlaylistSaveProgress> = {}): PlaylistSaveProgress {
  return {
    id: 'playlist-1',
    name: 'Na trening',
    spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
    confirmedTrackCount: 0,
    requestedTrackCount: 2,
    ...overrides,
  };
}

function partialSaveError(progress: PlaylistSaveProgress) {
  return { error: { code: 'PLAYLIST_SAVE_INCOMPLETE', details: { progress } } };
}
