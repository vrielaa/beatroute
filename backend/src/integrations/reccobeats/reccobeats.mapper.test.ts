import { describe, expect, it } from "vitest";

import { mapReccoBeatsAudioFeatures } from "./reccobeats.mapper.js";

describe("ReccoBeats audio features mapper", () => {
  it("maps available values and replaces missing values with null", () => {
    const result = mapReccoBeatsAudioFeatures({
      acousticness: 0.21,
      danceability: 0.72,
      energy: 0.84,
      instrumentalness: undefined,
      key: 4,
      liveness: 0.15,
      loudness: -5.4,
      mode: 1,
      speechiness: 0.06,
      tempo: 125,
      timeSignature: 4,
      valence: 0.67,
    });

    expect(result).toEqual({
      acousticness: 0.21,
      danceability: 0.72,
      energy: 0.84,
      instrumentalness: null,
      key: 4,
      liveness: 0.15,
      loudness: -5.4,
      mode: 1,
      speechiness: 0.06,
      tempo: 125,
      timeSignature: 4,
      valence: 0.67,
    });
  });

  it("returns null for every feature when the API response is empty", () => {
    expect(mapReccoBeatsAudioFeatures({})).toEqual({
      acousticness: null,
      danceability: null,
      energy: null,
      instrumentalness: null,
      key: null,
      liveness: null,
      loudness: null,
      mode: null,
      speechiness: null,
      tempo: null,
      timeSignature: null,
      valence: null,
    });
  });
});
