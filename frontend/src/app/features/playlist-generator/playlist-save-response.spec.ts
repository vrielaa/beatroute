import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  getPlaylistSaveErrorMessage,
  parseSavedPlaylist,
  readPartialPlaylistSaveProgress,
} from './playlist-save-response';

function createSavedPlaylist() {
  return {
    id: 'playlist-id',
    name: 'Na trening',
    spotifyUrl: 'https://open.spotify.com/playlist/playlist-id',
    trackCount: 2,
  };
}

function createProgress() {
  const { trackCount: _trackCount, ...metadata } = createSavedPlaylist();
  return { ...metadata, confirmedTrackCount: 100, requestedTrackCount: 250 };
}

function createPartialError(progress: unknown = createProgress(), status = 429) {
  return new HttpErrorResponse({
    status,
    error: {
      error: {
        code: 'PLAYLIST_SAVE_INCOMPLETE',
        message: 'secret-provider-message',
        details: { progress, accessToken: 'secret-token' },
      },
    },
  });
}

describe('parseSavedPlaylist', () => {
  it.each([1, 2, 500])('accepts exactly %i confirmed tracks', (trackCount) => {
    const response = { ...createSavedPlaylist(), trackCount };
    expect(parseSavedPlaylist(response, trackCount)).toEqual(response);
  });

  it('copies only public fields without mutating or retaining the response', () => {
    const response = { ...createSavedPlaylist(), accessToken: 'secret-token' };
    const parsed = parseSavedPlaylist(response, 2);
    response.name = 'Changed';
    expect(parsed).toEqual(createSavedPlaylist());
    expect(JSON.stringify(parsed)).not.toContain('secret-token');
  });

  it.each([
    null,
    [],
    {},
    { ...createSavedPlaylist(), id: '' },
    { ...createSavedPlaylist(), name: '  ' },
    { ...createSavedPlaylist(), trackCount: 0 },
    { ...createSavedPlaylist(), trackCount: 1 },
    { ...createSavedPlaylist(), trackCount: 501 },
    { ...createSavedPlaylist(), trackCount: 1.5 },
    { ...createSavedPlaylist(), trackCount: '2' },
    { ...createSavedPlaylist(), spotifyUrl: 'javascript:alert(1)' },
    { ...createSavedPlaylist(), spotifyUrl: 'http://open.spotify.com/playlist/playlist-id' },
    { ...createSavedPlaylist(), spotifyUrl: 'https://example.com/playlist/playlist-id' },
    { ...createSavedPlaylist(), spotifyUrl: 'https://open.spotify.com/playlist/other-id' },
    {
      ...createSavedPlaylist(),
      spotifyUrl: 'https://user:password@open.spotify.com/playlist/playlist-id',
    },
    {
      ...createSavedPlaylist(),
      spotifyUrl: 'https://open.spotify.com/playlist/playlist-id?secret=token',
    },
  ])('rejects a malformed or inconsistent confirmation: %j', (response) => {
    expect(() => parseSavedPlaylist(response, 2)).toThrow('Nie otrzymano poprawnego potwierdzenia');
  });
});

describe('readPartialPlaylistSaveProgress', () => {
  it.each([0, 100])('keeps %i confirmed tracks as partial progress', (confirmedTrackCount) => {
    const progress = { ...createProgress(), confirmedTrackCount };
    expect(readPartialPlaylistSaveProgress(createPartialError(progress))).toEqual(progress);
  });

  it('copies only approved progress fields', () => {
    const progress = { ...createProgress(), accessToken: 'secret-token', trackIds: ['secret-id'] };
    const parsed = readPartialPlaylistSaveProgress(createPartialError(progress));
    progress.confirmedTrackCount = 249;
    expect(parsed).toEqual(createProgress());
    expect(JSON.stringify(parsed)).not.toContain('secret-');
  });

  it.each([
    null,
    [],
    {},
    { ...createProgress(), confirmedTrackCount: -1 },
    { ...createProgress(), confirmedTrackCount: 0.5 },
    { ...createProgress(), confirmedTrackCount: 250 },
    { ...createProgress(), confirmedTrackCount: 251 },
    { ...createProgress(), requestedTrackCount: 0 },
    { ...createProgress(), requestedTrackCount: 501 },
    { ...createProgress(), requestedTrackCount: '250' },
    { ...createProgress(), spotifyUrl: 'https://example.com/playlist/playlist-id' },
  ])('does not trust invalid progress: %j', (progress) => {
    expect(readPartialPlaylistSaveProgress(createPartialError(progress))).toBeNull();
  });

  it.each([
    undefined,
    null,
    new Error('secret-error'),
    { error: { code: 'PLAYLIST_SAVE_INCOMPLETE', details: { progress: createProgress() } } },
    new HttpErrorResponse({
      status: 500,
      error: { error: { code: 'INTERNAL_SERVER_ERROR', details: { progress: createProgress() } } },
    }),
    new HttpErrorResponse({ status: 500, error: 'secret-response' }),
  ])('ignores an unrelated or malformed error: %j', (error) => {
    expect(readPartialPlaylistSaveProgress(error)).toBeNull();
  });
});

describe('getPlaylistSaveErrorMessage', () => {
  it.each([401, 403, 429, 504])('prioritizes partial writes over HTTP %i', (status) => {
    expect(getPlaylistSaveErrorMessage(createPartialError(createProgress(), status))).toBe(
      'Nie potwierdzono zapisu wszystkich utworów. Sprawdź utworzoną playlistę przed kolejnym zapisem.'
    );
  });

  it.each([
    { status: 400, text: 'Sprawdź jej nazwę i wybór utworów' },
    { status: 401, text: 'Połącz ponownie konto Spotify' },
    { status: 403, text: 'zezwól na zapisywanie prywatnych playlist' },
    { status: 413, text: 'maksymalnie 500' },
    { status: 0, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 500, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 502, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 503, text: 'Sprawdź swoje playlisty w Spotify' },
    { status: 504, text: 'Sprawdź swoje playlisty w Spotify' },
  ])('provides a safe instruction for HTTP $status', ({ status, text }) => {
    const error = new HttpErrorResponse({
      status,
      error: { error: { message: 'secret-message', details: 'secret-token' } },
    });
    const message = getPlaylistSaveErrorMessage(error);
    expect(message).toContain(text);
    expect(message).not.toContain('secret-');
  });

  it.each(['0', '30'])(
    'shows a valid Retry-After of %s seconds without suggesting automatic retry',
    (seconds) => {
      const error = new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': seconds }),
      });
      const message = getPlaylistSaveErrorMessage(error);
      expect(message).toContain(`Odczekaj ${seconds} s.`);
      expect(message).toContain('Sprawdź swoje playlisty');
    }
  );

  it.each(['', 'secret-header', '-1', '1.5', 'Infinity'])(
    'does not display invalid Retry-After: %j',
    (header) => {
      const error = new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': header }),
      });
      expect(getPlaylistSaveErrorMessage(error)).toBe(
        'Przekroczono limit zapytań Spotify. Odczekaj i sprawdź swoje playlisty przed kolejnym zapisem.'
      );
    }
  );

  it('does not expose a plain exception or assume that no playlist was created', () => {
    expect(getPlaylistSaveErrorMessage(new Error('secret-internal-details'))).toBe(
      'Nie otrzymano potwierdzenia zapisu. Sprawdź swoje playlisty w Spotify przed kolejną próbą.'
    );
  });
});
