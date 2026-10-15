import { describe, expect, it } from 'vitest';
import {
  getSavedTracksPreparationProgress,
  mergeSavedTracksPages,
} from './playlist-saved-tracks-preparation';
import type { PlaylistTrack, PreparedSavedTracksPage } from './playlist-generator.models';

describe('mergeSavedTracksPages', () => {
  it('returns a fresh empty dataset before receiving any pages', () => {
    const first = mergeSavedTracksPages([]);
    const second = mergeSavedTracksPages([]);

    expect(first).toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(first.dataset.tracks).not.toBe(second.dataset.tracks);
    expect(first.skippedTracks).not.toBe(second.skippedTracks);
    expect(first.incompleteTracks).not.toBe(second.incompleteTracks);
  });

  it('merges tracks, omissions and missing measurements in source order', () => {
    const first = createPage(0, 2, 6, [createId(0)]);
    first.preparedDataset.skippedTracks = [
      { spotifyId: createId(1), reason: 'metadata-unavailable' },
    ];
    const second = createPage(2, 2, 6, [createId(2)]);
    second.unavailableItemsCount = 1;
    second.preparedDataset.dataset.tracks[0].audioFeatures.energy = null;
    second.preparedDataset.incompleteTracks = [
      { spotifyId: createId(2), missingFeatures: ['energy'] },
    ];
    const third = createPage(4, 2, 6);

    const merged = mergeSavedTracksPages([first, second, third]);

    expect(merged).toEqual({
      dataset: {
        version: 1,
        tracks: [
          ...first.preparedDataset.dataset.tracks,
          ...second.preparedDataset.dataset.tracks,
          ...third.preparedDataset.dataset.tracks,
        ],
      },
      skippedTracks: first.preparedDataset.skippedTracks,
      incompleteTracks: second.preparedDataset.incompleteTracks,
    });
    expect(merged.dataset.tracks.map((track) => track.id)).toEqual([
      createId(0),
      createId(2),
      createId(4),
      createId(5),
    ]);
    expect(merged.dataset.tracks[0].audioFeatures.instrumentalness).toBe(0);
    expect(merged.dataset.tracks[1].audioFeatures.energy).toBeNull();
  });

  it('keeps the first prepared duplicate and only its missing-measurement information', () => {
    const first = createPage(0, 1, 3);
    first.preparedDataset.dataset.tracks[0].audioFeatures.energy = null;
    first.preparedDataset.incompleteTracks = [
      { spotifyId: createId(0), missingFeatures: ['energy'] },
    ];
    const second = createPage(1, 2, 3, [createId(0), createId(1)]);
    second.preparedDataset.dataset.tracks[0].name = 'Later metadata';
    second.preparedDataset.dataset.tracks[0].audioFeatures.valence = null;
    second.preparedDataset.incompleteTracks = [
      { spotifyId: createId(0), missingFeatures: ['valence'] },
    ];

    const merged = mergeSavedTracksPages([first, second]);

    expect(merged.dataset.tracks).toEqual([
      first.preparedDataset.dataset.tracks[0],
      second.preparedDataset.dataset.tracks[1],
    ]);
    expect(merged.dataset.tracks[0].audioFeatures.energy).toBeNull();
    expect(merged.incompleteTracks).toEqual(first.preparedDataset.incompleteTracks);
  });

  it('does not attach missing measurements from a later discarded duplicate', () => {
    const first = createPage(0, 1, 2);
    const second = createPage(1, 1, 2, [createId(0)]);
    second.preparedDataset.dataset.tracks[0].audioFeatures.valence = null;
    second.preparedDataset.incompleteTracks = [
      { spotifyId: createId(0), missingFeatures: ['valence'] },
    ];

    const merged = mergeSavedTracksPages([first, second]);

    expect(merged.dataset.tracks).toEqual(first.preparedDataset.dataset.tracks);
    expect(merged.incompleteTracks).toEqual([]);
  });

  it.each([true, false])(
    'does not report a prepared ID as skipped, whether the omission came first: %s',
    (omissionFirst) => {
      const first = createPage(0, 1, 2, omissionFirst ? [] : [createId(0)]);
      const second = createPage(1, 1, 2, omissionFirst ? [createId(0)] : []);
      const available = omissionFirst ? second : first;
      const unavailable = omissionFirst ? first : second;
      unavailable.preparedDataset.skippedTracks = [
        { spotifyId: createId(0), reason: 'audio-features-unavailable' },
      ];

      const merged = mergeSavedTracksPages([first, second]);

      expect(merged.dataset.tracks).toEqual(available.preparedDataset.dataset.tracks);
      expect(merged.skippedTracks).toEqual([]);
    }
  );

  it('deduplicates skipped IDs, preserving their first reason and order', () => {
    const first = createPage(0, 2, 4, []);
    first.preparedDataset.skippedTracks = [
      { spotifyId: createId(0), reason: 'metadata-unavailable' },
      { spotifyId: createId(1), reason: 'audio-features-unavailable' },
    ];
    const second = createPage(2, 2, 4, []);
    second.preparedDataset.skippedTracks = [
      { spotifyId: createId(0), reason: 'audio-features-unavailable' },
      { spotifyId: createId(2), reason: 'metadata-unavailable' },
    ];

    const merged = mergeSavedTracksPages([first, second]);

    expect(merged.dataset.tracks).toEqual([]);
    expect(merged.skippedTracks).toEqual([
      ...first.preparedDataset.skippedTracks,
      second.preparedDataset.skippedTracks[1],
    ]);
  });

  it('treats Spotify IDs as case-sensitive', () => {
    const upperCaseId = 'A'.repeat(22);
    const lowerCaseId = 'a'.repeat(22);

    const merged = mergeSavedTracksPages([
      createPage(0, 1, 2, [upperCaseId]),
      createPage(1, 1, 2, [lowerCaseId]),
    ]);

    expect(merged.dataset.tracks.map((track) => track.id)).toEqual([upperCaseId, lowerCaseId]);
  });

  it('does not mutate the pages or share result arrays with them', () => {
    const first = createPage(0, 1, 2);
    first.preparedDataset.dataset.tracks[0].audioFeatures.tempo = null;
    first.preparedDataset.incompleteTracks = [
      { spotifyId: createId(0), missingFeatures: ['tempo'] },
    ];
    const second = createPage(1, 1, 2, []);
    second.preparedDataset.skippedTracks = [
      { spotifyId: createId(1), reason: 'metadata-unavailable' },
    ];
    const pages = [first, second];
    const original = structuredClone(pages);

    const merged = mergeSavedTracksPages(pages);
    merged.dataset.tracks.pop();
    merged.skippedTracks.pop();
    merged.incompleteTracks.pop();

    expect(pages).toEqual(original);
    expect(merged.dataset).not.toBe(first.preparedDataset.dataset);
    expect(merged.dataset.tracks).not.toBe(first.preparedDataset.dataset.tracks);
    expect(merged.skippedTracks).not.toBe(second.preparedDataset.skippedTracks);
    expect(merged.incompleteTracks).not.toBe(first.preparedDataset.incompleteTracks);
  });

  it('merges all ten pages within the 500-position limit without dropping or reordering tracks', () => {
    const pages = Array.from({ length: 10 }, (_, index) => createPage(index * 50, 50, 750));

    const merged = mergeSavedTracksPages(pages);

    expect(merged.dataset.tracks.map((track) => track.id)).toEqual(
      Array.from({ length: 500 }, (_, index) => createId(index))
    );
    expect(merged.skippedTracks).toEqual([]);
    expect(merged.incompleteTracks).toEqual([]);
  });
});

describe('getSavedTracksPreparationProgress', () => {
  it('keeps the library size unknown until the first response', () => {
    expect(getSavedTracksPreparationProgress([])).toBeNull();
  });

  it('counts an empty library response as one completed page and zero positions', () => {
    expect(getSavedTracksPreparationProgress([createPage(0, 0, 0)])).toEqual({
      processedTracks: 0,
      totalTracks: 0,
      preparedTracks: 0,
      skippedTracks: 0,
      completedBatches: 1,
      totalBatches: 1,
    });
  });

  it.each([
    { completedPages: 1, processedTracks: 50 },
    { completedPages: 2, processedTracks: 100 },
    { completedPages: 3, processedTracks: 132 },
  ])(
    'reports $processedTracks of 132 after $completedPages completed pages',
    ({ completedPages, processedTracks }) => {
      const pages = [createPage(0, 50, 132), createPage(50, 50, 132), createPage(100, 32, 132)];

      expect(getSavedTracksPreparationProgress(pages.slice(0, completedPages))).toEqual({
        processedTracks,
        totalTracks: 132,
        preparedTracks: processedTracks,
        skippedTracks: 0,
        completedBatches: completedPages,
        totalBatches: 3,
      });
    }
  );

  it('counts a page of unavailable positions as processed without inventing track IDs', () => {
    const page = createPage(0, 50, 60, []);
    page.unavailableItemsCount = 50;

    expect(getSavedTracksPreparationProgress([page])).toEqual({
      processedTracks: 50,
      totalTracks: 60,
      preparedTracks: 0,
      skippedTracks: 50,
      completedBatches: 1,
      totalBatches: 2,
    });
    expect(mergeSavedTracksPages([page]).skippedTracks).toEqual([]);
  });

  it('counts all source positions but only unique prepared and skipped IDs', () => {
    const first = createPage(0, 3, 7, [createId(0)]);
    first.preparedDataset.skippedTracks = [
      { spotifyId: createId(1), reason: 'metadata-unavailable' },
    ];
    first.unavailableItemsCount = 1;
    const second = createPage(3, 4, 7, [createId(0), createId(2)]);
    second.preparedDataset.skippedTracks = [
      { spotifyId: createId(1), reason: 'audio-features-unavailable' },
    ];
    second.unavailableItemsCount = 1;

    expect(getSavedTracksPreparationProgress([first, second])).toEqual({
      processedTracks: 7,
      totalTracks: 7,
      preparedTracks: 2,
      skippedTracks: 3,
      completedBatches: 2,
      totalBatches: 2,
    });
  });

  it('removes a recovered ID from the skipped counter while retaining unavailable positions', () => {
    const first = createPage(0, 2, 3, []);
    first.preparedDataset.skippedTracks = [
      { spotifyId: createId(0), reason: 'audio-features-unavailable' },
    ];
    first.unavailableItemsCount = 1;
    const second = createPage(2, 1, 3, [createId(0)]);

    expect(getSavedTracksPreparationProgress([first, second])).toEqual({
      processedTracks: 3,
      totalTracks: 3,
      preparedTracks: 1,
      skippedTracks: 1,
      completedBatches: 2,
      totalBatches: 2,
    });
  });

  it('caps the target at 500 positions rather than the complete library size', () => {
    expect(getSavedTracksPreparationProgress([createPage(0, 50, 750)])).toEqual({
      processedTracks: 50,
      totalTracks: 500,
      preparedTracks: 50,
      skippedTracks: 0,
      completedBatches: 1,
      totalBatches: 10,
    });
  });

  it('finishes at 500 of 500 for a larger library even when all pages repeat the same ID', () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      createPage(index * 50, 50, 750, [createId(0)])
    );

    expect(getSavedTracksPreparationProgress(pages)).toEqual({
      processedTracks: 500,
      totalTracks: 500,
      preparedTracks: 1,
      skippedTracks: 0,
      completedBatches: 10,
      totalBatches: 10,
    });
  });

  it('uses actual page sizes rather than assuming that each completed page contained 50 positions', () => {
    const pages = [createPage(0, 10, 132), createPage(10, 20, 132)];

    expect(getSavedTracksPreparationProgress(pages)).toEqual({
      processedTracks: 30,
      totalTracks: 132,
      preparedTracks: 30,
      skippedTracks: 0,
      completedBatches: 2,
      totalBatches: 5,
    });
  });

  it('uses the latest library size and stops counting remaining pages at nextOffset null', () => {
    const pages = [createPage(0, 50, 100), createPage(50, 20, 70)];

    expect(getSavedTracksPreparationProgress(pages)).toEqual({
      processedTracks: 70,
      totalTracks: 70,
      preparedTracks: 70,
      skippedTracks: 0,
      completedBatches: 2,
      totalBatches: 2,
    });
  });

  it('does not mutate the pages or retain state between calculations', () => {
    const pages = [createPage(0, 50, 100)];
    const original = structuredClone(pages);

    const firstProgress = getSavedTracksPreparationProgress(pages);
    const secondProgress = getSavedTracksPreparationProgress(pages);

    expect(firstProgress).toEqual(secondProgress);
    expect(firstProgress).not.toBe(secondProgress);
    expect(pages).toEqual(original);
    expect(getSavedTracksPreparationProgress([])).toBeNull();
  });
});

function createPage(
  offset: number,
  processedItems: number,
  totalItems: number,
  trackIds = Array.from({ length: processedItems }, (_, index) => createId(offset + index))
): PreparedSavedTracksPage {
  const processedThrough = offset + processedItems;

  return {
    preparedDataset: {
      dataset: { version: 1, tracks: trackIds.map(createTrack) },
      skippedTracks: [],
      incompleteTracks: [],
    },
    pagination: {
      offset,
      processedItems,
      totalItems,
      nextOffset: processedThrough < Math.min(totalItems, 500) ? processedThrough : null,
    },
    unavailableItemsCount: 0,
  };
}

function createId(index: number): string {
  return String(index + 1).padStart(22, '0');
}

function createTrack(id: string): PlaylistTrack {
  return {
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
  };
}
