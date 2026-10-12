import { describe, expect, it } from 'vitest';
import type { GeneratedPlaylist, PlaylistTrackEvaluation } from './playlist-generator.models';
import { selectTopTrackIds, validateTopTrackCount } from './playlist-track-selection';

describe('validateTopTrackCount', () => {
  it.each([1, 2, 3])('accepts %s tracks within the available range', (trackCount) => {
    expect(validateTopTrackCount(trackCount, 3)).toBeNull();
  });

  it('requires a value for an empty count field', () => {
    expect(validateTopTrackCount(null, 3)).toBe('Podaj liczbę utworów.');
  });

  it.each([0, -1, 1.5, 4, NaN, Infinity, -Infinity])(
    'rejects the invalid limit %s rather than rounding or clamping it',
    (trackCount) => {
      expect(validateTopTrackCount(trackCount, 3)).toBe(
        'Liczba utworów musi być liczbą całkowitą od 1 do 3.'
      );
    }
  );

  it.each([null, 0, 1])('disallows selection from an empty ranking for %s', (trackCount) => {
    expect(validateTopTrackCount(trackCount, 0)).toBe('Nie ma dopuszczonych utworów do wyboru.');
  });
});

describe('selectTopTrackIds', () => {
  it('selects exactly the first 50 positions from a ranking of 100 tracks', () => {
    const result = createResult(100);

    expect(selectTopTrackIds(result, 50)).toEqual(
      Array.from({ length: 50 }, (_, index) => `track-${index + 1}`)
    );
    expect(result.rankedTracks).toHaveLength(100);
  });

  it('selects only the first position for a limit of one', () => {
    expect(selectTopTrackIds(createResult(3), 1)).toEqual(['track-1']);
  });

  it('selects every position when the count equals the ranking length', () => {
    const result = createResult(500);

    expect(selectTopTrackIds(result, result.rankedTracks.length)).toEqual(
      result.rankedTracks.map((evaluation) => evaluation.track.id)
    );
  });

  it('preserves supplied order instead of sorting by score or identifier', () => {
    const result: GeneratedPlaylist = {
      rankedTracks: [
        createEvaluation('zeta', 0.25),
        createEvaluation('alfa', 1),
        createEvaluation('remaining', 0.75),
      ],
      rejectedTracks: [],
    };

    expect(selectTopTrackIds(result, 2)).toEqual(['zeta', 'alfa']);
  });

  it('keeps accepted zero-score and unscored tracks eligible for selection', () => {
    const result: GeneratedPlaylist = {
      rankedTracks: [createEvaluation('zero-score', 0), createEvaluation('unscored', null)],
      rejectedTracks: [],
    };

    expect(selectTopTrackIds(result, 2)).toEqual(['zero-score', 'unscored']);
  });

  it('preserves received order for ties', () => {
    const result: GeneratedPlaylist = {
      rankedTracks: [createEvaluation('zeta', 0.5), createEvaluation('alfa', 0.5)],
      rejectedTracks: [],
    };

    expect(selectTopTrackIds(result, 2)).toEqual(['zeta', 'alfa']);
  });

  it('never selects rejected tracks or includes them in the available count', () => {
    const result = createResult(2);
    result.rejectedTracks = [
      {
        track: createEvaluation('rejected', 1).track,
        reasons: [{ feature: 'tempo', code: 'outside-range' }],
      },
    ];

    expect(selectTopTrackIds(result, 2)).toEqual(['track-1', 'track-2']);
    expect(() => selectTopTrackIds(result, 3)).toThrow(
      'Liczba utworów musi być liczbą całkowitą od 1 do 2.'
    );
  });

  it.each([0, -1, 1.5, 4, NaN, Infinity, -Infinity])(
    'throws for %s instead of silently selecting a different number of tracks',
    (trackCount) => {
      expect(() => selectTopTrackIds(createResult(3), trackCount)).toThrow(
        'Liczba utworów musi być liczbą całkowitą od 1 do 3.'
      );
    }
  );

  it.each([0, 1])('throws when the ranking is empty, including a limit of %s', (trackCount) => {
    expect(() => selectTopTrackIds(createResult(0), trackCount)).toThrow(
      'Nie ma dopuszczonych utworów do wyboru.'
    );
  });

  it('uses the supplied result rather than retaining selections from a previous ranking', () => {
    const firstResult: GeneratedPlaylist = {
      rankedTracks: [createEvaluation('first', 1), createEvaluation('second', 0)],
      rejectedTracks: [],
    };
    const nextResult: GeneratedPlaylist = {
      rankedTracks: [createEvaluation('second', 0.8), createEvaluation('first', 0.2)],
      rejectedTracks: [],
    };

    expect(selectTopTrackIds(firstResult, 1)).toEqual(['first']);
    expect(selectTopTrackIds(nextResult, 1)).toEqual(['second']);
  });

  it('does not mutate the ranking, evaluations or rejection reasons', () => {
    const result = createResult(3);
    result.rejectedTracks = [
      {
        track: createEvaluation('rejected').track,
        reasons: [{ feature: 'liveness', code: 'above-maximum' }],
      },
    ];
    const originalResult = structuredClone(result);
    Object.freeze(result);
    Object.freeze(result.rankedTracks);
    Object.freeze(result.rejectedTracks);
    result.rankedTracks.forEach((evaluation) => Object.freeze(evaluation));

    const selectedIds = selectTopTrackIds(result, 2);
    selectedIds.reverse();
    selectedIds.push('new-id');

    expect(result).toEqual(originalResult);
    expect(selectTopTrackIds(result, 2)).toEqual(['track-1', 'track-2']);
  });
});

function createResult(trackCount: number): GeneratedPlaylist {
  return {
    rankedTracks: Array.from({ length: trackCount }, (_, index) =>
      createEvaluation(`track-${index + 1}`)
    ),
    rejectedTracks: [],
  };
}

function createEvaluation(id: string, overallMatch: number | null = 0.5): PlaylistTrackEvaluation {
  return {
    track: {
      id,
      name: `Utwór ${id}`,
      artists: ['Przykładowy artysta'],
      audioFeatures: {
        tempo: 128,
        energy: 0.5,
        danceability: 0.7,
        valence: 0.5,
        acousticness: 0.1,
        instrumentalness: 0.2,
        speechiness: 0.1,
        liveness: 0.1,
      },
    },
    overallMatch,
    featureMatches: [],
  };
}
