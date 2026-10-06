import { describe, expect, it } from "vitest";
import {
  parseMusicMapAnalysisBody,
  parseMusicMapDatasetQuery,
} from "./validators.js";
import type { MusicMapDataset } from "@domain/music-map/types.js";

describe("music map request validation", () => {
  it("uses defaults suitable for the music map dataset", () => {
    expect(parseMusicMapDatasetQuery()).toEqual({
      limit: 40,
      timeRange: "long_term",
    });
  });

  it("parses the selected dataset range", () => {
    expect(
      parseMusicMapDatasetQuery({
        limit: "20",
        time_range: "short_term",
      })
    ).toEqual({
      limit: 20,
      timeRange: "short_term",
    });
  });

  it("accepts a valid dataset and cluster count", () => {
    const dataset = createDataset();

    expect(parseMusicMapAnalysisBody({ dataset, clusterCount: 4 })).toEqual({
      dataset,
      clusterCount: 4,
    });
  });

  it("rejects an unsupported cluster count", () => {
    expect(() =>
      parseMusicMapAnalysisBody({ dataset: createDataset(), clusterCount: 9 })
    ).toThrow(
      'Pole "clusterCount" musi być liczbą całkowitą od 2 do 8 albo wartością null'
    );
  });

  it("rejects audio features that do not belong to a dataset track", () => {
    const dataset = createDataset();
    dataset.audioFeatures[0] = {
      status: "failed",
      trackId: "different-track",
      reason: "Not found",
    };

    expect(() =>
      parseMusicMapAnalysisBody({ dataset, clusterCount: 2 })
    ).toThrow("Cechy audio muszą należeć do utworu obecnego w zbiorze");
  });
});

function createDataset(): MusicMapDataset {
  return {
    tracks: [
      {
        id: "track-1",
        name: "Track 1",
        artists: ["Artist"],
        album: "Album",
        imageUrl: null,
        spotifyUrl: "https://open.spotify.com/track/track-1",
      },
    ],
    audioFeatures: [
      {
        status: "found",
        trackId: "track-1",
        features: {
          energy: 0.8,
          tempo: 125,
        },
      },
    ],
    metadata: {
      timeRange: "long_term",
      requestedLimit: 40,
      spotifyReturnedTracksCount: 1,
      spotifyTotalTracksCount: 1,
    },
  };
}
