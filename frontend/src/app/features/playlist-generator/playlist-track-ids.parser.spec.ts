import { describe, expect, it } from 'vitest';
import { parsePlaylistTrackIdsFile } from './playlist-track-ids.parser';

describe('parsePlaylistTrackIdsFile', () => {
  const firstId = '3sNVsP50132BTNlImLx70i';
  const secondId = '4U4LEUWV8sFtos5PdjfDA7';

  it('accepts IDs without metadata or audio measurements', () => {
    const file = { version: 1, spotifyTrackIds: [firstId, secondId] };
    const value: unknown = JSON.parse(JSON.stringify(file));

    expect(parsePlaylistTrackIdsFile(value)).toEqual(file);
  });

  it('accepts exactly 500 syntactically valid identifiers', () => {
    const spotifyTrackIds = Array.from({ length: 500 }, (_, index) =>
      index.toString(36).padStart(22, '0')
    );

    expect(parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds }).spotifyTrackIds).toHaveLength(
      500
    );
  });

  it('rejects an empty list', () => {
    expect(() => parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: [] })).toThrow(
      'Plik musi zawierać od 1 do 500 identyfikatorów utworów'
    );
  });

  it('checks the submitted count before removing duplicates', () => {
    expect(() =>
      parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: Array(501).fill(firstId) })
    ).toThrow('Plik musi zawierać od 1 do 500 identyfikatorów utworów');
  });

  it.each([undefined, null, [], 'file', 1, true])('rejects a non-object file: %j', (value) => {
    expect(() => parsePlaylistTrackIdsFile(value)).toThrow(Error);
    expect(() => parsePlaylistTrackIdsFile(value)).toThrow(
      'Plik z identyfikatorami musi być obiektem'
    );
  });

  it.each([undefined, null, '1', 0, 2, true, [], {}])(
    'rejects an unsupported version: %j',
    (version) => {
      expect(() => parsePlaylistTrackIdsFile({ version, spotifyTrackIds: [firstId] })).toThrow(
        'pole version musi mieć wartość 1'
      );
    }
  );

  it.each([undefined, null, 'ids', 1, true, {}])(
    'rejects a non-array ID list: %j',
    (spotifyTrackIds) => {
      expect(() => parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds })).toThrow(
        'Pole spotifyTrackIds musi być tablicą'
      );
    }
  );

  it.each([undefined, null, 1, true, [], {}])('rejects a non-string ID: %j', (id) => {
    expect(() => parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: [id] })).toThrow(
      'Pole spotifyTrackIds[0] musi być tekstowym identyfikatorem Spotify'
    );
  });

  it.each([
    '',
    '   ',
    'track-001',
    'A'.repeat(21),
    'A'.repeat(23),
    'A'.repeat(21) + '_',
    'A'.repeat(21) + '-',
    'A'.repeat(21) + 'ą',
    'A'.repeat(10) + ' ' + 'A'.repeat(11),
    'https://open.spotify.com/track/' + firstId,
    'spotify:track:' + firstId,
  ])('rejects an invalid Spotify ID: %j', (id) => {
    expect(() => parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: [id] })).toThrow(
      'Spotify ID złożone z 22 liter lub cyfr'
    );
  });

  it('identifies the position of an invalid entry', () => {
    expect(() =>
      parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: [firstId, 'invalid'] })
    ).toThrow('Pole spotifyTrackIds[1]');
  });

  it('rejects a sparse list rather than skipping a missing ID', () => {
    expect(() => parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds: Array(1) })).toThrow(
      'Pole spotifyTrackIds[0]'
    );
  });

  it('trims IDs and removes duplicates while preserving first-occurrence order', () => {
    const file = {
      version: 1,
      spotifyTrackIds: [' ' + secondId + ' ', firstId, secondId, '\n' + firstId + '\t'],
    };

    expect(parsePlaylistTrackIdsFile(file)).toEqual({
      version: 1,
      spotifyTrackIds: [secondId, firstId],
    });
  });

  it('keeps case-sensitive identifiers distinct', () => {
    const spotifyTrackIds = ['A'.repeat(22), 'a'.repeat(22)];

    expect(parsePlaylistTrackIdsFile({ version: 1, spotifyTrackIds }).spotifyTrackIds).toEqual(
      spotifyTrackIds
    );
  });

  it('does not accept inherited version or IDs as supplied fields', () => {
    const inheritedVersion = Object.assign(Object.create({ version: 1 }), {
      spotifyTrackIds: [firstId],
    });
    const inheritedIds = Object.assign(Object.create({ spotifyTrackIds: [firstId] }), {
      version: 1,
    });

    expect(() => parsePlaylistTrackIdsFile(inheritedVersion)).toThrow('pole version');
    expect(() => parsePlaylistTrackIdsFile(inheritedIds)).toThrow('Pole spotifyTrackIds');
  });

  it('does not treat the old full dataset as a file of Spotify IDs', () => {
    expect(() => parsePlaylistTrackIdsFile({ version: 1, tracks: [] })).toThrow(
      'Pole spotifyTrackIds musi być tablicą'
    );
  });

  it('discards additional properties', () => {
    const file = {
      version: 1,
      spotifyTrackIds: [firstId],
      tracks: [{ name: 'Unused', audioFeatures: {} }],
      preferences: { energy: 'high' },
    };

    expect(parsePlaylistTrackIdsFile(file)).toEqual({ version: 1, spotifyTrackIds: [firstId] });
  });

  it('returns an independent object and array without mutating input', () => {
    const file = { version: 1, spotifyTrackIds: [firstId, secondId] };
    const original = structuredClone(file);
    Object.freeze(file.spotifyTrackIds);
    Object.freeze(file);

    const result = parsePlaylistTrackIdsFile(file);

    expect(result).toEqual(original);
    expect(result).not.toBe(file);
    expect(result.spotifyTrackIds).not.toBe(file.spotifyTrackIds);
    expect(file).toEqual(original);
  });

  it('does not retain identifiers between calls', () => {
    const file = { version: 1, spotifyTrackIds: [firstId] };

    expect(parsePlaylistTrackIdsFile(file)).toEqual(file);
    expect(parsePlaylistTrackIdsFile(file)).toEqual(file);
  });
});
