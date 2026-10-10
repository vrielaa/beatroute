import { describe, expect, it } from 'vitest';
import { parsePlaylistDataset } from './playlist-dataset.parser';
import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
  PlaylistTrack,
} from './playlist-generator.models';

describe('parsePlaylistDataset', () => {
  it('accepts a dataset decoded from JSON', () => {
    const dataset = createDataset();
    const value: unknown = JSON.parse(JSON.stringify(dataset));

    expect(parsePlaylistDataset(value)).toEqual(dataset);
  });

  it('returns independent copies without changing the input', () => {
    const dataset = createDataset();
    const original = structuredClone(dataset);

    const result = parsePlaylistDataset(dataset);

    expect(result).toEqual(original);
    expect(dataset).toEqual(original);
    expect(result).not.toBe(dataset);
    expect(result.tracks).not.toBe(dataset.tracks);
    expect(result.tracks[0]).not.toBe(dataset.tracks[0]);
    expect(result.tracks[0].artists).not.toBe(dataset.tracks[0].artists);
    expect(result.tracks[0].audioFeatures).not.toBe(dataset.tracks[0].audioFeatures);
  });

  it('trims identifiers, track names and artist names', () => {
    const track = {
      ...createTrack(),
      id: '  track-1  ',
      name: '  Track 1  ',
      artists: [' Artist A ', ' Artist B '],
    };

    const result = parsePlaylistDataset({ version: 1, tracks: [track] });

    expect(result.tracks[0]).toEqual({ ...createTrack(), artists: ['Artist A', 'Artist B'] });
    expect(track.id).toBe('  track-1  ');
    expect(track.artists).toEqual([' Artist A ', ' Artist B ']);
  });

  it('drops extra fields at the dataset, track and measurement levels', () => {
    const track = createTrack();
    const value = {
      version: 1,
      preferences: { energy: 'high' },
      tracks: [
        {
          ...track,
          provider: 'example',
          audioFeatures: { ...track.audioFeatures, extraFeature: 0.5 },
        },
      ],
    };

    expect(parsePlaylistDataset(value)).toEqual(createDataset());
  });

  it.each([undefined, null, [], 'dataset', 1, true])(
    'rejects a non-object dataset: %j',
    (value) => {
      expect(() => parsePlaylistDataset(value)).toThrow('Zbiór musi być obiektem');
    }
  );

  it.each([undefined, null, '1', 0, 2, true, [], {}])(
    'rejects an unsupported version: %j',
    (version) => {
      expect(() => parsePlaylistDataset({ ...createDataset(), version })).toThrow(
        'pole version musi mieć wartość 1'
      );
    }
  );

  it.each([undefined, null, 'tracks', 1, true, {}])(
    'rejects a non-array track list: %j',
    (tracks) => {
      expect(() => parsePlaylistDataset({ version: 1, tracks })).toThrow(
        'Pole tracks musi być tablicą'
      );
    }
  );

  it('rejects an empty track list', () => {
    expect(() => parsePlaylistDataset({ version: 1, tracks: [] })).toThrow(
      'Zbiór musi zawierać od 1 do 500 utworów'
    );
  });

  it('accepts exactly 500 tracks', () => {
    const tracks = Array.from({ length: 500 }, (_, index) => createTrack(`track-${index}`));

    expect(parsePlaylistDataset({ version: 1, tracks }).tracks).toHaveLength(500);
  });

  it('rejects more than 500 tracks', () => {
    const tracks = Array.from({ length: 501 }, (_, index) => createTrack(`track-${index}`));

    expect(() => parsePlaylistDataset({ version: 1, tracks })).toThrow(
      'Zbiór musi zawierać od 1 do 500 utworów'
    );
  });

  it.each([undefined, null, [], 'track', 1, true])('rejects a non-object track: %j', (track) => {
    expect(() => parsePlaylistDataset({ version: 1, tracks: [track] })).toThrow(
      'Utwór 1 musi być obiektem'
    );
  });

  describe.each(['id', 'name'])('track %s', (field) => {
    it.each([undefined, null, '', '   ', 1, true, [], {}])('rejects invalid text: %j', (value) => {
      const track = { ...createTrack(), [field]: value };

      expect(() => parsePlaylistDataset({ version: 1, tracks: [track] })).toThrow(
        `Utwór 1: pole ${field} musi być niepustym tekstem`
      );
    });
  });

  it.each(['track-1', '  track-1  '])('rejects duplicate identifiers after trimming: %j', (id) => {
    expect(() =>
      parsePlaylistDataset({ version: 1, tracks: [createTrack(), createTrack(id)] })
    ).toThrow('Utwór 2: identyfikator "track-1" jest powtórzony w zbiorze');
  });

  it('does not retain identifiers between separate calls', () => {
    expect(parsePlaylistDataset(createDataset())).toEqual(createDataset());
    expect(parsePlaylistDataset(createDataset())).toEqual(createDataset());
  });

  it.each([undefined, null, [], 'Artist', 1, true, {}, [null], [1], [''], ['   '], ['Artist', 1]])(
    'rejects invalid artist lists: %j',
    (artists) => {
      const track = { ...createTrack(), artists };

      expect(() => parsePlaylistDataset({ version: 1, tracks: [track] })).toThrow(
        /Utwór 1: pole artists/
      );
    }
  );

  it.each([undefined, null, [], 'features', 1, true])(
    'rejects non-object audio features: %j',
    (audioFeatures) => {
      const track = { ...createTrack(), audioFeatures };

      expect(() => parsePlaylistDataset({ version: 1, tracks: [track] })).toThrow(
        'Utwór 1: pole audioFeatures musi być obiektem'
      );
    }
  );

  it.each([
    'tempo',
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
    'speechiness',
    'liveness',
  ])('requires the %s measurement field', (feature) => {
    const audioFeatures: Record<string, unknown> = { ...createTrack().audioFeatures };
    delete audioFeatures[feature];

    expect(() =>
      parsePlaylistDataset({
        version: 1,
        tracks: [{ ...createTrack(), audioFeatures }],
      })
    ).toThrow(`Utwór 1: brak pola audioFeatures.${feature}`);
  });

  it('preserves all-null measurements instead of converting them to zero', () => {
    const audioFeatures: PlaylistAudioFeatures = {
      tempo: null,
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
      speechiness: null,
      liveness: null,
    };

    const result = parsePlaylistDataset({
      version: 1,
      tracks: [{ ...createTrack(), audioFeatures }],
    });

    expect(result.tracks[0].audioFeatures).toEqual(audioFeatures);
  });

  it.each([null, 0.1, 128, 128.5])('accepts tempo %j', (tempo) => {
    const track = createTrack();
    track.audioFeatures.tempo = tempo;

    expect(
      parsePlaylistDataset({ version: 1, tracks: [track] }).tracks[0].audioFeatures.tempo
    ).toBe(tempo);
  });

  it.each([undefined, '128', '', false, [], {}, 0, -1, NaN, Infinity, -Infinity])(
    'rejects invalid tempo %j',
    (tempo) => {
      const track = createTrack();
      const audioFeatures = { ...track.audioFeatures, tempo };

      expect(() =>
        parsePlaylistDataset({ version: 1, tracks: [{ ...track, audioFeatures }] })
      ).toThrow('Utwór 1: pole audioFeatures.tempo musi być dodatnią, skończoną liczbą albo null');
    }
  );

  describe.each([
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
    'speechiness',
    'liveness',
  ])('%s measurement', (feature) => {
    it.each([null, 0, 0.5, 1])('accepts %j', (measurement) => {
      const track = createTrack();
      const audioFeatures = { ...track.audioFeatures, [feature]: measurement };

      const result = parsePlaylistDataset({ version: 1, tracks: [{ ...track, audioFeatures }] });

      expect(result.tracks[0].audioFeatures).toEqual(audioFeatures);
    });

    it.each([undefined, '0.5', false, {}, [], -0.1, 1.1, NaN, Infinity, -Infinity])(
      'rejects %j',
      (measurement) => {
        const track = createTrack();
        const audioFeatures = { ...track.audioFeatures, [feature]: measurement };

        expect(() =>
          parsePlaylistDataset({ version: 1, tracks: [{ ...track, audioFeatures }] })
        ).toThrow(
          `Utwór 1: pole audioFeatures.${feature} musi być skończoną liczbą od 0 do 1 albo null`
        );
      }
    );
  });
});

function createDataset(): PlaylistDataset {
  return { version: 1, tracks: [createTrack()] };
}

function createTrack(id = 'track-1'): PlaylistTrack {
  return {
    id,
    name: 'Track 1',
    artists: ['Artist A'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0.1,
      speechiness: 0.05,
      liveness: 0.15,
    },
  };
}
