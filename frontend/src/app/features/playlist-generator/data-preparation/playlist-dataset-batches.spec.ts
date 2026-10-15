import { describe, expect, it } from 'vitest';
import {
  getPlaylistPreparationProgress,
  mergePreparedPlaylistDatasets,
  splitPlaylistTrackIds,
} from './playlist-dataset-batches';
import type { PlaylistTrackIdsFile, PreparedPlaylistDataset } from '../playlist-generator.models';

describe('splitPlaylistTrackIds', () => {
  it.each([1, 19, 20, 21, 40, 41, 500])(
    'preserves all %i IDs in ordered batches of at most 20',
    (count) => {
      const file = createFile(count);
      const originalIds = [...file.spotifyTrackIds];

      const batches = splitPlaylistTrackIds(file);

      expect(batches).toHaveLength(Math.ceil(count / 20));
      expect(batches.flatMap((batch) => batch.spotifyTrackIds)).toEqual(originalIds);
      expect(batches.every((batch) => batch.version === 1)).toBe(true);
      expect(batches.every((batch) => batch.spotifyTrackIds.length <= 20)).toBe(true);
      expect(batches.every((batch) => batch.spotifyTrackIds.length > 0)).toBe(true);
      expect(file.spotifyTrackIds).toEqual(originalIds);
    }
  );

  it('does not share ID arrays with the source file or another batch', () => {
    const file = createFile(21);
    const originalIds = [...file.spotifyTrackIds];
    const batches = splitPlaylistTrackIds(file);

    batches[0].spotifyTrackIds.pop();
    batches[1].spotifyTrackIds.push('new-id');

    expect(file.spotifyTrackIds).toEqual(originalIds);
    expect(batches[0].spotifyTrackIds).toHaveLength(19);
  });
});

describe('mergePreparedPlaylistDatasets', () => {
  it('preserves tracks, omissions and missing measurements in batch order', () => {
    const first = createPreparedDataset(['first']);
    const second = createPreparedDataset(['second']);
    first.skippedTracks = [{ spotifyId: 'missing-first', reason: 'metadata-unavailable' }];
    second.skippedTracks = [{ spotifyId: 'missing-second', reason: 'audio-features-unavailable' }];
    second.dataset.tracks[0].audioFeatures.energy = null;
    second.incompleteTracks = [{ spotifyId: 'second', missingFeatures: ['energy'] }];
    const beforeFirst = structuredClone(first);
    const beforeSecond = structuredClone(second);

    const merged = mergePreparedPlaylistDatasets(first, second);

    expect(merged).toEqual({
      dataset: { version: 1, tracks: [...first.dataset.tracks, ...second.dataset.tracks] },
      skippedTracks: [...first.skippedTracks, ...second.skippedTracks],
      incompleteTracks: second.incompleteTracks,
    });
    expect(merged.dataset.tracks.map((track) => track.id)).toEqual(['first', 'second']);
    expect(merged.dataset.tracks[0].audioFeatures.instrumentalness).toBe(0);
    expect(merged.dataset.tracks[1].audioFeatures.energy).toBeNull();
    expect(first).toEqual(beforeFirst);
    expect(second).toEqual(beforeSecond);
    expect(merged.dataset.tracks).not.toBe(first.dataset.tracks);
    expect(merged.skippedTracks).not.toBe(first.skippedTracks);
    expect(merged.incompleteTracks).not.toBe(second.incompleteTracks);
  });

  it('merges an empty batch and retains its skipped IDs', () => {
    const empty = createPreparedDataset([]);
    empty.skippedTracks = [{ spotifyId: 'missing', reason: 'metadata-unavailable' }];
    const available = createPreparedDataset(['available']);

    const merged = mergePreparedPlaylistDatasets(empty, available);

    expect(merged.dataset.tracks.map((track) => track.id)).toEqual(['available']);
    expect(merged.skippedTracks).toEqual(empty.skippedTracks);
  });
});

describe('getPlaylistPreparationProgress', () => {
  it('starts at zero without counting pending IDs as processed', () => {
    expect(getPlaylistPreparationProgress(createFile(45), [])).toEqual({
      processedTracks: 0,
      totalTracks: 45,
      preparedTracks: 0,
      skippedTracks: 0,
      completedBatches: 0,
      totalBatches: 3,
    });
  });

  it('distinguishes processed IDs from prepared and skipped tracks', () => {
    const first = createPreparedDataset(createFile(20).spotifyTrackIds.slice(2));
    first.skippedTracks = createFile(2).spotifyTrackIds.map((spotifyId) => ({
      spotifyId,
      reason: 'metadata-unavailable',
    }));

    expect(getPlaylistPreparationProgress(createFile(45), [first])).toEqual({
      processedTracks: 20,
      totalTracks: 45,
      preparedTracks: 18,
      skippedTracks: 2,
      completedBatches: 1,
      totalBatches: 3,
    });
  });

  it('counts a fully skipped batch and the shorter final batch as processed', () => {
    const file = createFile(45);
    const batches = splitPlaylistTrackIds(file).map((batch) => ({
      ...createPreparedDataset([]),
      skippedTracks: batch.spotifyTrackIds.map((spotifyId) => ({
        spotifyId,
        reason: 'audio-features-unavailable' as const,
      })),
    }));

    expect(getPlaylistPreparationProgress(file, batches)).toEqual({
      processedTracks: 45,
      totalTracks: 45,
      preparedTracks: 0,
      skippedTracks: 45,
      completedBatches: 3,
      totalBatches: 3,
    });
  });
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
